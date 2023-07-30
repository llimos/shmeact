// There are 4 types of element
// - Component (can have children)
// - DOM node (can have children)
// - Text
// - Array

// Elements start out as an element spec. This is not the same type of object that goes in the virtual DOM,
// though there are similarities.
// This is what gets returned from a component's render method.
// Component and DOM elements are objects that describe the props and children
// Texts are just strings
// Arrays are just arrays
// A component can also return null, so that is also a valid spec

// There is a difference between children of a component and children of a DOM element
// children of a component are simply a prop that has been passed in in a different way
// It's up to the component whether to render them or not
// Children of a DOM node will always appear in the DOM - they are its children
// even in the rendered result
// We use `children` for the spec and `childNodes` for the actual children

// Type of a Shmeact component function. Your components should satisfy this
export type ShmeactComponent<T extends ShmeactProps = any> = (props: T & {children?: ShmeactElementSpec[] | null}) => ShmeactElementSpec;

interface ShmeactProps {
    ref?: Ref;
    [x:string]: any;
}

/** Props used by Shmeact itself, not to be put in the DOM */
const internalProps = ['key', 'ref'];

// The 4 different element specs
// This is what's returned from rendering a component,
// not what's in the virtual DOM

interface ShmeactComponentElementSpec {
    type: 'component';
    component: ShmeactComponent | MemoComponent;
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

/**
* Used during the render process to identify
* where in the real DOM something should go
*/
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
interface Ref<T = any> {
    current: T;
}
interface Memo<T = any> {
    value: T;
    deps: unknown[];
}


// Classes representing Shmeact elements
// These make up the virtual DOM

/**
Represents the DOM element that is the root of the tree
*/
class ShmeactRootElement {
    readonly dom: Element;
    rendered: ShmeactElement | null = null;
    
    constructor(dom: Element) {
        this.dom = dom;
    }
    
    render(spec: ShmeactElementSpec): void {
        if (this.rendered)
            if (this.rendered.canUpdateWith(spec)) {
                this.rendered.update(spec);
            } else {
                this.rendered.remove();
                this.rendered = null;
            }
        if (spec && !this.rendered) {
            this.rendered = ShmeactElement.factory(spec, this);
            this.rendered.create({domParent: this.dom, offset: 0});
        }
    }
    
    unmount(): void {
        this.rendered?.remove();
        this.rendered = null;
    }
}

interface ShmeactRootHandle {
    render(spec: ShmeactElementSpec): void;
    unmount(): void;
}

/** Base class of all Shmeact elements */
abstract class ShmeactElement<T extends ShmeactElementSpec = ShmeactElementSpec> {
    domNodesCount: number = 0;
    constructor(public parent: ParentElement) { }
    /** Creates the element in the real DOM */
    abstract create(domLocation: DomLocation): void;
    /** Updates the element in the virtual and real DOM */
    abstract update(spec: T, domLocation?: DomLocation): void;
    /** Removes the element from the real DOM */
    abstract remove(skipDomRemoval?: boolean): void;
    /** Moves the element to a different place in the real DOM */
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
    
    /**
    * Returns the real (DOM) location of this element,
    * which consists of the real DOM parent, and
    * how many other real DOM elements are before this one
    */
    getDomLocation(): DomLocation {
        let currentOffset = 0;
        if (this.parent instanceof ShmeactElementWithChildren) {
            for (const sibling of this.parent.childNodes) {
                if (sibling === this)
                    break;
                currentOffset += sibling.domNodesCount;
            }
        }
        if (this.parent instanceof ShmeactDomElement)
            return {domParent: this.parent.rendered!, offset: currentOffset};
        if (this.parent instanceof ShmeactRootElement)
            return {domParent: this.parent.dom, offset: currentOffset};
        
        const {domParent, offset} = this.parent.getDomLocation();
        return {domParent, offset: offset + currentOffset};
    }
    
    /** Returns true if the provided spec is valid for this element type */
    static isSpec: (spec: ShmeactElementSpec) => boolean;
    
    /** Creates an element given a spec */
    static factory(spec: Exclude<ShmeactElementSpec, null>, parent: ParentElement): ShmeactElement {
        if (ShmeactDomElement.isSpec(spec))
            return new ShmeactDomElement(spec, parent);
        if (ShmeactArrayElement.isSpec(spec))
            return new ShmeactArrayElement(spec, parent);
        if (ShmeactMemoComponentElement.isSpec(spec))
            return new ShmeactMemoComponentElement(spec, parent);
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
            // Text element matches almost any spec, so do that last
            const existing =
                this.childNodes.find(c => !reconciled.has(c) && !(c instanceof ShmeactTextElement) && c.canUpdateWith(child))
                    ?? this.childNodes.find(c => !reconciled.has(c) && c instanceof ShmeactTextElement && c.canUpdateWith(child));
            
            // If we don't, create it
            if (!existing) {
                const created = ShmeactElement.factory(child, this);
                this.childNodes.splice(newIndex, 0, created);
                created.create({domParent, offset});
                offset += created.domNodesCount;
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
    
    removeChildren(skipDomRemoval: boolean): void {
        if (this.childNodes)
            for (const child of this.childNodes)
                child.remove(skipDomRemoval);
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
        // Create a real DOM element
        this.rendered = document.createElement(this.component);
        
        // Attach to real DOM
        appendChild(this.rendered, domLocation);

        // Update DOM node count for this and parents
        this.updateDomNodeCount(1);
        
        // Children
        this.createChildren({domParent: this.rendered, offset: 0});

        // Add attributes and events
        this.updateAttributes(null, this.props)
    }
    
    canUpdateWith(spec: ShmeactElementSpec): spec is ShmeactDomElementSpec {
        // Key has to match if it exists
        return super.canUpdateWith(spec) && spec.component === this.component && spec.props?.key === this.props?.key;
    }

    update(spec: ShmeactDomElementSpec): void {
        this.updateChildren(spec.children, {domParent: this.rendered!, offset: 0});
        this.updateAttributes(this.props, spec.props);
        this.props = spec.props;
    }

    updateAttributes(oldProps: ShmeactProps | null, newProps: ShmeactProps | null): void {
        if (!this.rendered)
            throw new Error('updateAttributes called on non-rendered element');

        oldProps = oldProps ?? {};
        newProps = newProps ?? {};

        // Go through the new props, and add or update where necessary
        for (const [k, v] of Object.entries(newProps)) {
            // Ref
            if (k === 'ref' && !oldProps.ref && 'current' in v)
                v.current = this.rendered;

            if (internalProps.includes(k)) // includes ref
                continue;

            if (v !== oldProps[k]) { // Changed or added
                if (k.startsWith('on')) { // Event
                    // Event
                    const eventName = k.slice(2).toLowerCase();
                    // Need to remove the old one if there is one
                    if (oldProps[k])
                        this.rendered.removeEventListener(eventName, oldProps[k]);
                    // Add the new one
                    this.rendered.addEventListener(eventName, v);

                } else if (k === 'style') { // Style is a special case
                    const oldStyle: any = oldProps.style ?? {};
                    for (const [sk, sv] of Object.entries(v))
                        if (sv !== oldStyle[sk])
                            //@ts-ignore Add or update style
                            this.rendered.style[sk] = sv;
                    for (const sk of Object.keys(oldStyle))
                        if (!(sk in v))
                            //@ts-ignore Been removed
                            this.rendered.style[sk] = null;

                } else { // Anything else
                    //@ts-ignore because we're not checking which attributes are valid
                    this.rendered[k] = v;
                }
            }
        }
        // Check for removed
        for (const [k, v] of Object.entries(oldProps))
            if (!internalProps.includes(k) && v !== null && v !== undefined && !(k in newProps))
                if (k === 'ref' && 'current' in v)
                    v.current = undefined;
                else if (k.startsWith('on'))
                    this.rendered.removeEventListener(k.slice(2).toLowerCase(), v);
                else if (k === 'style')
                    for (const sk of Object.keys(v))
                        //@ts-ignore
                        (this.rendered as HTMLElement).style[sk] = undefined;
                else
                    //@ts-ignore
                    this.rendered[k] = undefined;
    }

    remove(skipDomRemoval: boolean = false) {
        this.removeChildren(true);
        
        // Null the ref is there is one
        if (this.props?.ref?.current)
            this.props.ref.current = null;
    
        // Remove the DOM element itself
        if (!skipDomRemoval) {
            this.rendered?.remove();
            this.rendered = null;
            // Update DOM node count
            this.updateDomNodeCount(-1)
        }
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
        this.createChildren(domLocation);
    }
    
    update(spec: ShmeactArrayElementSpec): void {
        this.updateChildren(spec, this.getDomLocation());
    }
    
    remove(skipDomRemoval: boolean = false) {
        this.removeChildren(skipDomRemoval);
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
    create(domLocation: DomLocation): void {
        this.rendered = document.createTextNode(String(this.value));
        appendChild(this.rendered, domLocation);

        // Update DOM node count
        this.updateDomNodeCount(1);
    }
    
    update(spec: ShmeactStringElementSpec) {
        this.value = spec;
        this.rendered!.data = String(spec);
    }
    
    remove(skipDomRemoval: boolean = false): void {
        if (!skipDomRemoval) {
            // Remove the DOM element itself
            this.rendered?.remove();
            this.rendered = null;

            // Update DOM node count
            this.updateDomNodeCount(-1);
        }
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
    layoutEffects: Effect[] = [];
    refs: Ref[] = [];
    memos: Memo[] = [];
    
    // Variables used while rendering
    static currentlyRendering: ShmeactComponentElement | null = null;
    currentStateIndex: number = 0;
    currentEffectIndex: number = 0;
    currentLayoutEffectIndex: number = 0;
    currentRefIndex: number = 0;
    currentMemoIndex: number = 0;
    currentEffectQueue: Effect[] = [];
    currentLayoutEffectQueue: Effect[] = [];
    
    constructor(spec: ShmeactComponentElementSpec, parent: ParentElement) {
        super(parent);
        this.component = spec.component;
        this.props = spec.props;
        this.children = spec.children;
    }
    
    create(domLocation: DomLocation): void {
        this.render(domLocation);
    }
    
    canUpdateWith(spec: ShmeactElementSpec): spec is ShmeactComponentElementSpec {
        // Key has to match if it exists
        return super.canUpdateWith(spec) && spec.component === this.component && spec.props?.key === this.props?.key;
    }
    
    update(spec: ShmeactComponentElementSpec): void {
        this.props = spec.props;
        this.children = spec.children;
        this.render();
    }

    render(domLocation?: DomLocation): void {
        // Set up global variables
        ShmeactComponentElement.currentlyRendering = this;
        this.currentStateIndex = this.currentEffectIndex = this.currentLayoutEffectIndex = this.currentRefIndex = this.currentMemoIndex = 0;
        this.currentEffectQueue = [];
        this.currentLayoutEffectQueue = [];

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
                this.rendered.create(domLocation ?? this.getDomLocation());
            } else {
                this.rendered = null;
            }
        }

        // Done rendering and reconciling to DOM. Run effects on the next tick
        if (this.currentLayoutEffectQueue.length > 0) {
            const myLayoutEffectQueue = this.currentLayoutEffectQueue;
            window.requestAnimationFrame(() => myLayoutEffectQueue.forEach(this.runEffect));
        }
        if (this.currentEffectQueue.length > 0) {
            const myEffectQueue = this.currentEffectQueue;
            window.setTimeout(() => myEffectQueue.forEach(this.runEffect));
        }
    }
    
    remove(skipDomRemoval: boolean = false) {
        this.rendered?.remove(skipDomRemoval);
        if (this.effects)
            for (const effect of this.effects)
                try {
                    effect.teardown?.();
                } catch (e) {
                    console.error('Error running effect teardown', e);
                }
    }
    
    move(domLocation: DomLocation) {
        this.rendered?.move(domLocation);
    }
    

    // Hooks
    // The global useXXX functions look up which is the currently rendering component
    // and forward the call to here

    useState<T>(initial: () => T): [T, SetStateFunction<T>];
    useState<T>(initial: T): [T, SetStateFunction<T>];
    useState<T>(): [T|undefined, SetStateFunction<T>];
    useState<T>(initial?: T|(() => T)): [T|undefined, SetStateFunction<T>] {
        const index = this.currentStateIndex++;
        
        if (this.state.length <= index)
            this.state[index] = typeof initial === 'function' ? (initial as ()=>T)() : initial;

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
    
        return [this.state[index] as T, setStateFunction];
    }
    
    useEffect(effect: EffectFunction, deps?: unknown[]): void {
        const index = this.currentEffectIndex++;
        let entry = this.effects[index];
        
        if (!entry) {
            entry = { effect, deps };
            this.effects[index] = entry;
            this.currentEffectQueue.push(entry);
        } else if (this.depsChanged(entry.deps, deps)) {
            entry.effect = effect;
            entry.deps = deps;
            this.currentEffectQueue.push(entry);
        }
    }

    useLayoutEffect(effect: EffectFunction, deps?: unknown[]): void {
        const index = this.currentLayoutEffectIndex++;
        let entry = this.layoutEffects[index];

        if (!entry) {
            entry = { effect, deps };
            this.layoutEffects[index] = entry;
            this.currentLayoutEffectQueue.push(entry);
        } else if (this.depsChanged(entry.deps, deps)) {
            entry.effect = effect;
            entry.deps = deps;
            this.currentLayoutEffectQueue.push(entry);
        }
    }

    useRef<T = any>(): Ref<T|undefined>;
    useRef<T = any>(initial: T): Ref<T>;
    useRef<T = any>(initial?: T) {
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
                // If we found it, return the value of the 'context' prop
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

class ShmeactMemoComponentElement extends ShmeactComponentElement {
    static isSpec(spec: ShmeactElementSpec): spec is ShmeactComponentElementSpec {
        return super.isSpec(spec)
            && 'isMemo' in spec.component
            && spec.component.isMemo;
    }

    // Only update if the props have changed
    update(spec: ShmeactComponentElementSpec): void {
        if (propsChanged(this.props, spec.props) || childrenChanged(this.children, spec.children))
            super.update(spec);
    }
}

// Helper functions for the memo element
// to determine if props have changed
// Defined outside the class because we recurse through the children
function specChanged(oldSpec: ShmeactElementSpec, newSpec: ShmeactElementSpec): boolean {
    if (ShmeactArrayElement.isSpec(oldSpec))
        return ShmeactArrayElement.isSpec(newSpec) ? childrenChanged(oldSpec, newSpec) : true;
    if (ShmeactComponentElement.isSpec(oldSpec) || ShmeactDomElement.isSpec(oldSpec)) {
        if (!ShmeactComponentElement.isSpec(newSpec) && !ShmeactDomElement.isSpec(newSpec))
            return true;
        return oldSpec.component !== newSpec.component
            || propsChanged(oldSpec.props, newSpec.props)
            || (Array.isArray(oldSpec.children) && Array.isArray(newSpec.children) ? childrenChanged(oldSpec.children, newSpec.children) : oldSpec.children !== newSpec.children);
    }
    return newSpec !== oldSpec;
}
function propsChanged(oldProps: ShmeactProps|null, newProps: ShmeactProps|null): boolean {
    if (oldProps === null && newProps === null)
        return false;
    if (oldProps === null || newProps === null)
        return true;
    if (Object.keys(oldProps).length !== Object.keys(newProps).length)
        return true;
    for (const [key, value] of Object.entries(oldProps))
        if (!(key in newProps) || newProps[key] !== value)
            return true;
    return false;
}
function childrenChanged(oldChildren: ShmeactElementSpec[]|null, newChildren: ShmeactElementSpec[]|null): boolean {
    if (oldChildren === null && newChildren === null)
        return false;
    if (oldChildren === null || newChildren === null)
        return true;
    if (oldChildren.length !== newChildren.length)
        return true;
    for (const [index, child] of oldChildren.entries())
        if (specChanged(child, newChildren[index]))
            return true;
    return false;
}


type ParentElement = ShmeactElementWithChildren | ShmeactComponentElement | ShmeactRootElement; 

/**
* Place the actual element in the DOM at the specified offset
*/
function appendChild(node: Node, domLocation: DomLocation): void {
    // Attach to real DOM
    if (domLocation.offset === 0)
        domLocation.domParent.prepend(node);
    else
        domLocation.domParent.childNodes[domLocation.offset - 1].after(node);
}


// Hooks - forward to the instance

type SetStateFunction<T> = ((newval: T | ((oldval: T) => T)) => void)

export function useState<T>(initial: () => T): [T, SetStateFunction<T>];
export function useState<T>(initial: T extends () => any ? never : T): [T, SetStateFunction<T>];
export function useState<T>(): [T | undefined, SetStateFunction<T>];
export function useState<T>(initial?: T | (() => T)) {
    if (!ShmeactComponentElement.currentlyRendering)
        throw new Error('useState called outside render');
    return ShmeactComponentElement.currentlyRendering?.useState(initial);
}
type Reducer<T, A = any> = (state: T, action: A) => T;
export function useReducer<T, A = any>(reducer: Reducer<T>, initialArg: T): [T, (action: A) => void];
export function useReducer<T, A = any>(reducer: Reducer<T>, initialArg: unknown, init: (init: typeof initialArg) => T): [T, (action: A) => void];
export function useReducer<T, A = any>(reducer: Reducer<T>, initialArg: any, init?: (init: typeof initialArg) => T): [T, (action: A) => void] {
    // Use useState internally
    const [state, setState] = useState<T>(() => init ? init(initialArg) : initialArg as T);
    return [state, (action: A) => setState(reducer(state, action))];
}
export function useEffect(effect: EffectFunction, deps?: any[]): void {
    if (!ShmeactComponentElement.currentlyRendering)
        throw new Error('useEffect called outside render');
    return ShmeactComponentElement.currentlyRendering?.useEffect(effect, deps);
}
export function useLayoutEffect(effect: EffectFunction, deps?: any[]): void {
    if (!ShmeactComponentElement.currentlyRendering)
        throw new Error('useLayoutEffect called outside render');
    return ShmeactComponentElement.currentlyRendering?.useLayoutEffect(effect, deps);
}
export function useRef<T = any>(): Ref<T|undefined>;
export function useRef<T = any>(initial: T): Ref<T>;
export function useRef<T = any>(initial?: T) {
    if (!ShmeactComponentElement.currentlyRendering)
        throw new Error('useRef called outside render');
    return ShmeactComponentElement.currentlyRendering.useRef(initial);
}
/** Used when you want to have a ref to a Shmeact component element */
export function forwardRef<T extends ShmeactProps>(component: (restPops: T, ref: Ref) => ShmeactElementSpec): ShmeactComponent<T & {ref?: Ref}> {
    return (props: T & {ref?: Ref}) => {
        let {ref, ...rest} = props;
        return component(rest as T, ref ?? {current: undefined});
    }
}
/** When there is a ref to a Shmeact component element, this sets what the ref should do */
export function useImperativeHandle(ref: Ref, handle: any): void {
    ref.current = handle;
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


// Context

// createContext creates a component that has a context prop
// useContext looks up the tree to find that component and retrieve its prop
interface Context<T> {
    Provider: ShmeactComponent<{context: T}>;
    defaultValue: T;
}
export function createContext<T>(): Context<T | undefined>;
export function createContext<T>(defaultValue: T): Context<T>;
export function createContext<T>(defaultValue?: T) {
    return {
        Provider: ({children}: {children?: ShmeactElementSpec[]|null}) => children ?? null,
        defaultValue
    };
}
export function useContext<T>(context: Context<T>): T {
    if (!ShmeactComponentElement.currentlyRendering)
        throw new Error('useContext called outside render');
    return ShmeactComponentElement.currentlyRendering.useContext(context);
}

type MemoComponent<T extends ShmeactProps = any> = ShmeactComponent<T> & {isMemo: true};
export function memo<T extends ShmeactProps = any>(component: ShmeactComponent<T>): MemoComponent<T> {
    // Returns a version of the component
    // with a flag to tell the renderer that it's memoized
    const newFunc: MemoComponent<T> = props => component(props);
    newFunc.isMemo = true;
    return newFunc;
}


// Render process

// New API
export function createRoot(domElement: Element): ShmeactRootHandle {
    // Clear out whatever's there first
    domElement.replaceChildren();
    const root = new ShmeactRootElement(domElement);

    // Shmeact Devtools! Uncomment to see the VDOM in the console
    console.log('Welcome to Shmeact Devtools!')
    console.log('Rendering to', domElement);
    console.dir(root); // Should dynamically update in console so you see the whole VDOM

    return {
        render(spec: ShmeactElementSpec): void {
            root.render(spec);
        },
        unmount(): void {
            root.unmount();
        }
    };
}

// Old API

// Map of mounted roots. Used only for unmounting
const shmeactRoots = new Map<Element, ShmeactRootHandle>();

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
