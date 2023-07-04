// Type of a Shmeact component function. Your components should satisfy this
export type ShmeactComponent<T extends ShmeactProps = {}> = (props: T & {children?: ShmeactElementSpec[] | null}) => ShmeactElementSpec;

interface ShmeactProps {
    ref?: Ref;
    [x:string]: any;
}

/** Props used by Shmeact itself, not to be put in the DOM */
const internalProps = ['key', 'ref'];
interface ShmeactComponentElementSpec {
    type: 'component';
    component: ShmeactComponent;
    props: ShmeactProps | null;
    children: ShmeactElementSpec[] | null;
}
interface ShmeactDomElementSpec {
    type: 'dom';
    component: string;
    props: ShmeactProps | null;
    children: ShmeactElementSpec[] | null;
}
type ShmeactStringElementSpec = string | NonNullable<{toString: () => string}>;
type ShmeactArrayElementSpec = ShmeactElementSpec[];

/** This is what could be returned from a render method */
type ShmeactElementSpec = ShmeactComponentElementSpec | ShmeactDomElementSpec | ShmeactStringElementSpec | ShmeactArrayElementSpec | null;

interface DomLocation {
    domParent: Element;
    offset: number;
}

// Effects
type EffectFunction = (() => void) | (() => (() => void));
interface Effect {
    effect: EffectFunction;
    deps: unknown[] | undefined;
    teardown?: (() => void) | undefined;
}
interface Ref<T = unknown> {
    current: T;
}
interface Memo<T = unknown> {
    value: T;
    deps: unknown[];
}


// Classes representing Shmeact elements

class ShmeactRootElement {
    readonly dom: Element;
    #rendered: ShmeactElement | null = null;
    
    constructor(dom: Element) {
        this.dom = dom;
    }
    
    render(spec: ShmeactElementSpec): void {
        if (this.#rendered)
            if (this.#rendered.canUpdateWith(spec)) {
                this.#rendered.update(spec);
            } else {
                this.#rendered.remove();
                this.#rendered = null;
            }
        if (spec && !this.#rendered) {
            this.#rendered = ShmeactElement.factory(spec, this);
            this.#rendered.create({domParent: this.dom, offset: 0});
        }
    }
    
    unmount(): void {
        this.#rendered?.remove();
        this.#rendered = null;
    }
}

abstract class ShmeactElement<T extends ShmeactElementSpec = ShmeactElementSpec> {
    domNodesCount: number = 0;
    constructor(public parent: ParentElement) { }
    abstract create(domLocation?: DomLocation): void;
    abstract update(spec: T, domLocation?: DomLocation): void;
    abstract remove(): void;
    abstract move(domLocation: DomLocation): void;
    
    /**
    * Returns true if the spec provided can be used to update the element
    * By default any valid spec for the type returns true
    * Subclasses can override
    */
    canUpdateWith(spec: ShmeactElementSpec): spec is T {
        return (this.constructor as typeof ShmeactElement).isSpec(spec);
    }
    
    updateDomNodeCount(delta: number): void {
        this.domNodesCount += delta;
        if (! (this.parent instanceof ShmeactDomElement || this.parent instanceof ShmeactRootElement))
            this.parent.updateDomNodeCount(delta);
    }
    
    getDomLocation(): DomLocation {
        let offset = 0;
        if (this.parent instanceof ShmeactElementWithChildren) {
            for (const sibling of this.parent.childNodes) {
                if (sibling === this)
                    break;
                offset += sibling.domNodesCount;
            }
        }
        if (this.parent instanceof ShmeactDomElement)
            return {domParent: this.parent.rendered!, offset};
        if (this.parent instanceof ShmeactRootElement)
            return {domParent: this.parent.dom, offset};
        
        const parentLocation = this.parent.getDomLocation();
        parentLocation.offset += offset;
        return parentLocation;
    }
    
    static isSpec: (spec: ShmeactElementSpec) => boolean;
    
    static factory(spec: Exclude<ShmeactElementSpec, null>, parent: ParentElement): ShmeactElement {
        if (ShmeactDomElement.isSpec(spec))
            return new ShmeactDomElement(spec, parent);
        if (ShmeactArrayElement.isSpec(spec))
            return new ShmeactArrayElement(spec, parent);
        if (ShmeactComponentElement.isSpec(spec))
            return new ShmeactComponentElement(spec, parent);
        if (ShmeactTextElement.isSpec(spec))
            return new ShmeactTextElement(spec, parent);
        throw new Error('Invalid element spec');
    }
}


abstract class ShmeactElementWithChildren<T extends ShmeactElementSpec = ShmeactElementSpec> extends ShmeactElement<T> {
    childNodes: ShmeactElement[] = [];
    
    constructor(public children: ShmeactElementSpec[] | null, parent: ParentElement) {
        super(parent);
    }

    createChildren(domLocation: DomLocation): void {
        let childrenOffset = 0;
        if (this.children)
            for (const child of this.children)
                if (child !== null) {
                    const renderedChild = ShmeactElement.factory(child, this);
                    this.childNodes.push(renderedChild);
                    renderedChild.create({...domLocation, offset: domLocation.offset + childrenOffset});
                    childrenOffset += renderedChild.domNodesCount;
                }    
    }

    updateChildren(spec: ShmeactElementSpec[] | null, {domParent, offset}: DomLocation): void {
        if (!spec) {
            for (const child of this.childNodes)
                child.remove();
            return;
        }
        // We match based on element type, component type, and order in the array
        // So we need to keep track of which ones we've seen

        // Make sure we don't match the same existing one twice
        const reconciled = new Set<ShmeactElement>;
        // Keep track of how many 'null' components we got, to adjust the array index
        let nulls = 0;
        // Iterate through updated
        for (let [newIndex, child] of spec.entries()) {
            // Skip the nulls but keep track
            if (child === null) {
                nulls++;
                continue;
            }

            newIndex -= nulls; // The index we want it to end up in

            // See if we have it in existing
            // Text element matches almost anything, so do that last
            const existing =
                this.childNodes.find(c => !reconciled.has(c) && !(c instanceof ShmeactTextElement) && c.canUpdateWith(child))
                    ?? this.childNodes.find(c => !reconciled.has(c) && c instanceof ShmeactTextElement && c.canUpdateWith(child));
            
            // If we don't, create it
            if (!existing) {
                const created = ShmeactElement.factory(child, this);
                this.childNodes.splice(newIndex, 0, created);
                offset += created.domNodesCount;
                created.create();
                reconciled.add(created);
            } else {
                // If we do,
                // Update it
                existing.update(child);
                // Reorder it if necessary
                const oldIndex = this.childNodes.indexOf(existing); 
                if (oldIndex !== newIndex) {
                    // Do the move in the VDOM
                    this.childNodes.splice(newIndex, 0, this.childNodes.splice(oldIndex, 1)[0]);
                    // Do the move in the DOM
                    existing.move({domParent, offset});
                }
                // Update the offset
                offset += existing.domNodesCount;
                // Add it to the used set
                reconciled.add(existing);
            }
        }
        // Anything left in existing, remove
        for (const originalChild of this.childNodes)
            if (!reconciled.has(originalChild)) {
                originalChild.remove();
                this.childNodes.splice(this.childNodes.indexOf(originalChild), 1);
            }
    }
    
    removeChildren(): void {
        if (this.childNodes)
            for (const child of this.childNodes)
                child.remove();
        this.childNodes = [];
    }
}


class ShmeactDomElement extends ShmeactElementWithChildren<ShmeactDomElementSpec> {
    component: string;
    props: ShmeactProps | null;
    
    rendered: Element | null = null;
    
    constructor(spec: ShmeactDomElementSpec, parent: ParentElement) {
        super(spec.children, parent);
        this.component = spec.component;
        this.props = spec.props;
    }
    
    create(domLocation: DomLocation) {
        this.rendered = document.createElement(this.component);

        if (this.props)
            for (const [key, val] of Object.entries(this.props)) {
                // Attach the DOM element to the ref
                if (key === 'ref' && 'current' in val)
                    val.current = this.rendered;

                // Ignore internal props - don't put them in the DOM
                if (internalProps.includes(key))
                    continue;

                if (key.startsWith('on'))
                    // Event handlers
                    // React adds them all at the root, we're not going to do that
                    this.rendered.addEventListener(key.slice(2).toLowerCase(), val);
                else
                    //@ts-ignore Real React knows what properties are allowed on each element type
                    this.rendered[key] = val;
            }
        
        // Attach to real DOM
        appendChild(this.rendered, domLocation ?? this.getDomLocation());

        // Update DOM node count for this and parents
        this.updateDomNodeCount(1);
        
        // Children
        this.createChildren({domParent: this.rendered, offset: 0});
    }
    
    canUpdateWith(spec: ShmeactElementSpec): spec is ShmeactDomElementSpec {
        return super.canUpdateWith(spec) && spec.component === this.component;
    }

    update(spec: ShmeactDomElementSpec) {
        // Update attributes
        const newProps = spec.props ?? {};
        // Check for added, removed, and changed
        const copy = {...newProps};

        if (this.props)
            for (const [k, v] of Object.entries(this.props)) {
                // Ignore internal props - don't put them in the DOM
                if (internalProps.includes(k))
                    continue;

                // Different behaviour for attributes and events
                if (k.startsWith('on')) {  // Event
                    const eventName = k.slice(2).toLowerCase();
                    if (!(k in newProps) || newProps[k] !== v) {
                        // If it's either changed or removed, remove it
                        this.rendered?.removeEventListener(eventName, v);
                        // If it's changed, add the new one back in
                        if (k in newProps)
                            this.rendered?.addEventListener(eventName, newProps[k]);
                    }
                } else {  // Regular attribute
                    if (k in newProps) {
                        // Exists in old and new
                        if (v !== newProps[k])
                            // Changed in new
                            //@ts-ignore We don't know if it's a real property or not
                            this.rendered[k] = newProps[k];
                        delete copy[k];
                    } else {
                        // Removed in new
                        //@ts-ignore We don't know if it's a real property or not
                        this.rendered[k] = undefined; // Should reset to default
                    }
                }
            }
        // Whatever's left in the set is new
        for (const [nk, nv] of Object.entries(copy))
            if (nk.startsWith('on'))
                this.rendered?.addEventListener(nk.slice(2).toLowerCase(), nv);
        else
            //@ts-ignore We don't know if it's a real property or not
            this.rendered[nk] = nv;

        // Update vdom props
        this.props = spec.props;

        // Update children
        this.updateChildren(spec.children, {domParent: this.rendered!, offset: 0});
    }
    
    remove() {
        this.removeChildren();
        
        // Null the ref is there is one
        if (this.props?.ref?.current)
            this.props.ref.current = null;
    
        // Remove the DOM element itself
        this.rendered?.remove();
        this.rendered = null;

        // Update DOM node count
        this.updateDomNodeCount(-1)
    }
    
    move(domLocation: DomLocation): void {
        appendChild(this.rendered!, domLocation);
    }

    static isSpec(spec: ShmeactElementSpec): spec is ShmeactDomElementSpec {
        return Boolean(spec && typeof spec === 'object' && 'type' in spec && spec.type === 'dom');
    }
}


class ShmeactArrayElement extends ShmeactElementWithChildren<ShmeactArrayElementSpec> {
    create(domLocation: DomLocation): void {
        this.createChildren(domLocation ?? this.getDomLocation());
    }
    
    update(spec: ShmeactArrayElementSpec): void {
        this.updateChildren(spec, this.getDomLocation());
    }
    
    remove() {
        this.removeChildren();
    }
    
    move(domLocation: DomLocation) {
        for (const child of this.childNodes) {
            child.move(domLocation);
            domLocation = {...domLocation, offset: domLocation.offset + child.domNodesCount};
        }
    }
    
    static isSpec(spec: ShmeactElementSpec): spec is ShmeactArrayElementSpec {
        return Array.isArray(spec);
    }
}


class ShmeactTextElement extends ShmeactElement {
    rendered: Text | null = null;
    
    constructor(public value: ShmeactStringElementSpec, parent: ParentElement) {
        super(parent);
    }
    create(domLocation?: DomLocation): void {
        this.rendered = document.createTextNode(String(this.value));
        appendChild(this.rendered, domLocation ?? this.getDomLocation());

        // Update DOM node count
        this.updateDomNodeCount(1);
    }
    
    update(spec: ShmeactStringElementSpec) {
        this.value = spec;
        this.rendered!.data = String(spec);
    }
    
    remove(): void {
        // Remove the DOM element itself
        this.rendered?.remove();
        this.rendered = null;

        // Update DOM node count
        this.updateDomNodeCount(-1);
    }
    
    move(domLocation: DomLocation): void {
        appendChild(this.rendered!, domLocation);
    }
    
    static isSpec(spec: ShmeactElementSpec): spec is ShmeactStringElementSpec {
        if (spec === null || spec === undefined)
            return false;
        // Make sure it can be cast to a string
        try {
            '' + spec;
            return true;
        } catch {
            return false;
        }
    }
}


class ShmeactComponentElement extends ShmeactElement<ShmeactComponentElementSpec> {
    component: ShmeactComponent;
    props: ShmeactProps | null;
    children: ShmeactElementSpec[] | null;
    
    rendered: ShmeactElement | null = null;
    state: unknown[] = [];
    effects: Effect[] = [];
    refs: Ref[] = [];
    memos: Memo[] = [];
    
    // Variables used while rendering
    static currentlyRendering: ShmeactComponentElement | null = null;
    currentStateIndex: number = 0;
    currentEffectIndex: number = 0;
    currentRefIndex: number = 0;
    currentMemoIndex: number = 0;
    currentEffectQueue: Effect[] = [];
    
    constructor(spec: ShmeactComponentElementSpec, parent: ParentElement) {
        super(parent);
        this.component = spec.component;
        this.props = spec.props;
        this.children = spec.children;
    }
    
    create(domLocation?: DomLocation): void {
        this.render(domLocation);
    }
    
    canUpdateWith(spec: ShmeactElementSpec): spec is ShmeactComponentElementSpec {
        return super.canUpdateWith(spec) && spec.component === this.component;
    }
    
    update(spec: ShmeactComponentElementSpec) {
        this.props = spec.props;
        this.children = spec.children;
        this.render();
    }

    render(domLocation?: DomLocation): void {
        // Set up global variables
        ShmeactComponentElement.currentlyRendering = this;
        this.currentStateIndex = this.currentEffectIndex = this.currentRefIndex = this.currentMemoIndex = 0;
        this.currentEffectQueue = [];

        // Do the render
        const {component, props, children} = this;
        const renderResult = component({...props, children}) ?? null;
        // React used to enforce returning null, not undefined
        // Te rest of Shmeact only checks for null, so coerce undefined to null
        // just in case someone got it wrong

        ShmeactComponentElement.currentlyRendering = null;

        // If the types are the same, update the existing element
        if (this.rendered && this.rendered.canUpdateWith(renderResult))
            this.rendered.update(renderResult);
        // Otherwise, it's not the same type of component, we need to remove and re-add (or just remove or just add)
        else {
            // Remove existing if any
            this.rendered?.remove();
            // Add new
            if (renderResult) {
                this.rendered = ShmeactElement.factory(renderResult, this);
                this.rendered.create(domLocation);
            } else {
                this.rendered = null;
            }
        }

        // Done rendering and reconciling to DOM. Run effects on the next tick
        if (this.currentEffectQueue.length > 0) {
            const myEffectQueue = this.currentEffectQueue;
            window.setTimeout(() => myEffectQueue.forEach(this.runEffect));
        }
    }
    
    remove() {
        this.rendered?.remove();
        if (this.effects)
            for (const effect of this.effects)
                effect.teardown?.();
    }
    
    move(domLocation: DomLocation) {
        this.rendered?.move(domLocation);
    }
    
    // Hooks
    
    useState<T>(initital: T): [T, SetStateFunction<T>];
    useState<T>(): [T|undefined, SetStateFunction<T>];
    useState<T>(initial?: T) {
        const index = this.currentStateIndex++;
        
        if (this.state.length <= index)
            this.state[index] = initial;

        // Keep current value handy for the set state function
        const currentValue = this.state[index] as T;
        const setStateFunction = (newValue: T | ((old: T) => T)): void => {
            // A set state function can accept either a new value,
            // or a function that gets passed the old value and returns the new one
            this.state[index] = typeof newValue === 'function'
                ? (newValue as (old: T) => T)(currentValue)
                : newValue;
            // Rerender
            this.render();
        }
    
        return [this.state[index], setStateFunction];
    }
    
    useEffect(effect: EffectFunction, deps?: unknown[]): void {
        const index = this.currentEffectIndex++;
        let entry = this.effects[index];
        
        if (!entry) {
            entry = { effect, deps };
            this.currentEffectQueue.push(entry);
            this.effects[index] = entry;
        } else if (this.depsChanged(entry.deps, deps)) {
            entry.effect = effect;
            entry.deps = deps;
            this.currentEffectQueue.push(entry);
        }
    }
    
    useRef<T>(): Ref<T|undefined>;
    useRef<T>(initial: T): Ref<T>;
    useRef<T>(initial?: T) {
        const index = this.currentRefIndex++;

        if (this.refs.length <= index)
            this.refs.push({current: initial})

        return this.refs[index];
    }
    
    useMemo<T>(fn: () => T, deps: unknown[]): T {
        const index = this.currentMemoIndex++;
        
        if (this.memos.length <= index || this.depsChanged(this.memos[index].deps, deps))
            this.memos[index] = { value: fn(), deps };

        return this.memos[index].value as T;
    }
    
    useContext<T>(context: Context<T>): T {
        // Walk up the component tree, looking for a provider
        let currentParent = this.parent;
        while (!(currentParent instanceof ShmeactRootElement)) {
            if (currentParent instanceof ShmeactComponentElement && currentParent.component === context.Provider)
                return currentParent.props!.context as T;
            currentParent = currentParent.parent;
        }
        // If we don't find one, return the default value
        return context.defaultValue;
    }

    depsChanged(oldDeps: any[] | undefined, newDeps: any[] | undefined): boolean {
        if (!oldDeps || !newDeps)
            return true;
        if (oldDeps.length !== newDeps.length)
            return true;
        return oldDeps.some((value, index) => value !== newDeps[index]);
    }

    runEffect(effectDef: Effect): void {
        // If the previous iteration returned a teardown function, run it
        if (effectDef.teardown) {
            try {
                effectDef.teardown();
            } catch (e) {
                console.error('Error running effect teardown', e);
            }
        }
        // Run the actual effect
        try {
            effectDef.teardown = effectDef.effect() ?? undefined;
        } catch (e) {
            console.error('Error running effect', e);
        }
    }
    
    static isSpec(spec: ShmeactElementSpec): spec is ShmeactComponentElementSpec {
        return Boolean(spec && typeof spec === 'object' && 'type' in spec && spec.type === 'component');
    }
}

type ParentElement = ShmeactElementWithChildren | ShmeactComponentElement | ShmeactRootElement; 

function appendChild(node: Node, domLocation: DomLocation): void {
    // Attach to real DOM
    if (!domLocation.offset)
        domLocation.domParent.prepend(node);
    else
        domLocation.domParent.childNodes[domLocation.offset - 1].after(node);
}


// Hooks - forward to the instance

type SetStateFunction<T> = ((newval: T | ((oldval: T) => T)) => void)

export function useState<T>(initital: T): [T, SetStateFunction<T>];
export function useState<T>(): [T|undefined, SetStateFunction<T>];
export function useState<T>(initial?: T) {
    return ShmeactComponentElement.currentlyRendering?.useState(initial);
}
export function useEffect(effect: EffectFunction, deps?: any[]): void {
    return ShmeactComponentElement.currentlyRendering?.useEffect(effect, deps);
}
export function useRef<T>(): Ref<T|undefined>;
export function useRef<T>(initial: T): Ref<T>;
export function useRef<T>(initial?: T) {
    if (!ShmeactComponentElement.currentlyRendering)
        throw new Error('useRef called outside render');
    return ShmeactComponentElement.currentlyRendering.useRef(initial);
}
export function useMemo<T = any>(fn: () => T, deps: any[]): T {
    if (!ShmeactComponentElement.currentlyRendering)
        throw new Error('useMemo called outside render');
    return ShmeactComponentElement.currentlyRendering.useMemo(fn, deps);
}
// This is straight from the React docs!
export function useCallback<T extends () => {}>(fn: T, deps: any[]): T {
    return useMemo(() => fn, deps);
}

interface Context<T> {
    Provider: ShmeactComponent<{context: T}>;
    defaultValue: T;
}
export function createContext<T>(defaultValue: T): Context<T> {
    return {
        Provider: ({context, children}: {context: T, children?: ShmeactElementSpec[]|null}) => children ?? null,
        defaultValue
    };
}
export function useContext<T>(context: Context<T>): T {
    if (!ShmeactComponentElement.currentlyRendering)
        throw new Error('useContext called outside render');
    return ShmeactComponentElement.currentlyRendering.useContext(context);
}


// Render process

// New API
export function createRoot(domElement: Element): ShmeactRootElement {
    // Clear out whatever's there first
    domElement.replaceChildren();
    const root = new ShmeactRootElement(domElement);
    // Shmeact Devtools! Uncomment to see the VDOM in the console
    console.dir(root);
    return root;
}

// Old API

// Map of mounted roots. Used only for unmounting
const shmeactRoots = new Map<Element, ShmeactRootElement>();

export function domRender(root: Element, element: ShmeactElementSpec): void {
    const rootElement = createRoot(root);
    shmeactRoots.set(root, rootElement);
    rootElement.render(element);
}

/** Remove it all - equivalent of ReactDOM.unmountComponentAtNode */
export function domUnmount(root: Element): void {
    shmeactRoots.get(root)?.unmount();
    shmeactRoots.delete(root);
}

// JSX create element
export function createElement(component: ShmeactComponent | string, props: ShmeactProps, ...children: ShmeactElementSpec[]): ShmeactComponentElementSpec | ShmeactDomElementSpec {
    return typeof component === 'function' ? {
        type: 'component',
        component, props, children
    } : {
        type: 'dom',
        component, props, children
    };
}


// Like the React fragment
// Returns an array of the children
export const Fragment = ({children}: {children: ShmeactElement[]}) => children;
