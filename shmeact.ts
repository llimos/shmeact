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
export type ShmeactComponent<T extends ShmeactProps = {}> = (props: T & {children?: ShmeactElementSpec[] | null}) => ShmeactElementSpec;

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

/** This is what could be returned from a render method */
type ShmeactElementSpec = ShmeactComponentElementSpec | ShmeactDomElementSpec | ShmeactStringElementSpec | ShmeactElementSpec[] | null;

// Each of the four also has a rendered form. This is what appears in the virtual DOM
// and they are all objects
// They all contain a reference to their parent
// and the number of real DOM nodes they contain (to help with the reconciliation later)

// Only certain types can be parents
type ParentElement = ShmeactComponentElement | ShmeactDomElement | ShmeactArrayElement | ShmeactRootElement; 
interface ShmeactElementBase {
    parent: ParentElement;
    domNodesCount: number;
}
// The object representing the component in the virtual DOM also contains its state and effects
interface ShmeactComponentElement extends ShmeactComponentElementSpec, ShmeactElementBase {
    rendered?: ShmeactElement | null; // The result of rendering
    state: any[];
    effects: Effect[];
    layoutEffects: Effect[];
    refs: Ref[];
    memos: Memo[];
}
// Children of the rendered DOM element must be VDOM objects, not specs
interface ShmeactDomElement extends Omit<ShmeactDomElementSpec, 'children'>, ShmeactElementBase {
    dom: Element; // Link to the actual element in the HTML
    childNodes: ShmeactElement[]; // Named to avoid confusion with component children
    domNodesCount: 1; // Always only 1 - itself
}
interface ShmeactArrayElement extends ShmeactElementBase {
    type: 'array';
    childNodes: ShmeactElement[];
}
interface ShmeactTextElement extends ShmeactElementBase {
    type: 'text';
    value: ShmeactStringElementSpec; // It will be coerced to a string if necessary
    dom: Text;
    domNodesCount: 1;
}

/** This is what makes up the virtual DOM tree */
type ShmeactElement = ShmeactComponentElement | ShmeactDomElement | ShmeactTextElement | ShmeactArrayElement;

// The root element is special - it's a DOM element that has a single child and no parent
interface ShmeactRootElement {
    type: 'root';
    dom: Element;
    rendered: ShmeactElement | null;
}
/** This is the public interface that gets returned from createRoot */
interface ShmeactRootHandle {
    render(spec: ShmeactElementSpec): void;
    unmount(): void;
}

// Effects
type EffectFunction = (() => void) | (() => (() => void));
interface Effect {
    effect: EffectFunction;
    deps: any[] | undefined;
    teardown?: (() => void) | undefined;
}

interface Ref<T = any> {
    current: T;
}

interface Memo<T = any> {
    value: T;
    deps: any[];
}


// JSX translates into createElement calls,
// which basically do nothing and simply wrap the data in an object
// which might be a Component element spec or a DOM element spec
export function createElement(component: ShmeactComponent | string, props: ShmeactProps, ...children: ShmeactElementSpec[]): ShmeactComponentElementSpec | ShmeactDomElementSpec {
    return typeof component === 'function' ? {
        type: 'component', component, props, children
    } : {
        type: 'dom', component, props, children
    };
}

function isComponentElement(element: ShmeactElement): element is ShmeactComponentElement;
function isComponentElement(element: ShmeactElementSpec): element is ShmeactComponentElementSpec;
function isComponentElement(element: ShmeactElement | ShmeactElementSpec) {
    return element && typeof element === 'object' && !Array.isArray(element) && 'type' in element && element?.type === 'component';
}

function isDomElement(element: ShmeactElement): element is ShmeactDomElement;
function isDomElement(element: ShmeactElementSpec): element is ShmeactDomElementSpec;
function isDomElement(element: ShmeactElement | ShmeactElementSpec){
    return element && typeof element === 'object' && !Array.isArray(element) && 'type' in element && element?.type === 'dom';
}
function isStringElement(element: ShmeactElement | ShmeactRootElement): element is ShmeactTextElement {
    return typeof element === 'object' && !Array.isArray(element) && element?.type === 'text';
}
function isArrayElement(element: ShmeactElement | ShmeactRootElement): element is ShmeactArrayElement {
    return typeof element === 'object' && !Array.isArray(element) && element?.type === 'array';
}
function isRootElement(element: ShmeactElement | ShmeactRootElement): element is ShmeactRootElement {
    return typeof element === 'object' && !Array.isArray(element) && element?.type === 'root';
}


// Render process
// It all starts here - this is where we mount the initial component

// New API
export function createRoot(rootElement: Element): ShmeactRootHandle {
    rootElement.replaceChildren();

    // This is the real root node, that forms the root of our virtual DOM
    const rootNode: ShmeactRootElement =  {
        type: 'root',
        dom: rootElement,
        rendered: null,
    };

    // Shmeact Devtools! Uncomment to see the VDOM in the console
    console.log('Welcome to Shmeact Devtools!')
    console.log('Rendering to', rootElement);
    console.dir(rootNode); // Should dynamically update in console so you see the whole VDOM

    // This is a handle that lets the outside world do stuff with our root node
    return {
        render(spec: ShmeactElementSpec) {
            if (canUpdate(rootNode.rendered, spec))
                update(rootNode.rendered, spec)
            else {
                if (rootNode.rendered)
                    remove(rootNode.rendered);
                if (spec)
                    rootNode.rendered = create(spec, rootNode, rootNode.dom, 0);
            }
        },
        unmount() {
            if (rootNode.rendered)
                remove(rootNode.rendered);
            rootNode.rendered = null;
        }
    }
}

// Old API

// Map of mounted roots. Used only for unmounting
const shmeactRoots = new Map<Element, ShmeactRootHandle>();

/** How we mount the initial component - equivalent of ReactDOM.render */
export function domRender(root: Element, element: ShmeactElementSpec): void {
    const rootNode = createRoot(root);

    // Add it to our roots map
    shmeactRoots.set(root, rootNode);

    // Render
    if (element !== null)
        rootNode.render(element);
}

/** Remove it all - equivalent of ReactDOM.unmountComponentAtNode */
export function domUnmount(root: Element): void {
    shmeactRoots.get(root)?.unmount();
    shmeactRoots.delete(root);
}


// Reconciliation
// This is what updates the virtual DOM and changes the real DOM to match
// We do both together. I think real React does them separately

// Things that may have changed:
// Add new elements
// Remove elements
// Add, remove, or update props
// Reorder elements (in an array)


// The following methods reconcile the changes to the DOM

/**
* Used when the component being added does not already exist
*/
function create(elementSpec: NonNullable<ShmeactElementSpec>, parent: ParentElement, domParent: Element, offset: number): ShmeactElement {
    
    // DOM element
    if (isDomElement(elementSpec)) {
        const domElement = document.createElement(elementSpec.component);
        // Attach to real DOM
        appendChild(domElement, domParent, offset);
        
        // Vdom node
        const rendered: ShmeactDomElement = {
            type: elementSpec.type,
            component: elementSpec.component,
            props: elementSpec.props,
            parent,
            childNodes: [],
            dom: domElement,
            domNodesCount: 1
        };
        
        // Update parents' DOM node count
        updateParentsDomNodeCount(parent, 1);
        
        // Children
        let childOffset = 0;
        if (elementSpec.children)
            for (const child of elementSpec.children)
                if (child !== null) {
                    const renderedChild = create(child, rendered, domElement, childOffset);
                    rendered.childNodes.push(renderedChild);
                    childOffset += renderedChild.domNodesCount;
                }
        
        // Attributes
        if (elementSpec.props)
            updateDomElementAttributes(domElement, null, elementSpec.props);

        return rendered;
    }
    
    // Component element
    else if (isComponentElement(elementSpec)) {
        const rendered: ShmeactComponentElement = {
            ...elementSpec,
            parent,
            domNodesCount: 0,
            state: [],
            effects: [],
            layoutEffects: [],
            refs: [],
            memos: [],
        };
        // Render it
        // Parent and offset haven't changed since we didn't add anything to the DOM
        renderComponentElement(rendered, domParent, offset);
        
        return rendered;
    }
    
    // Array element
    if (Array.isArray(elementSpec)) {
        const rendered: ShmeactArrayElement = {
            type: 'array',
            childNodes: [],
            parent,
            domNodesCount: 0
        };
        // Entries in the array
        for (const entry of elementSpec)
            if (entry !== null)
                rendered.childNodes.push(create(entry, rendered, domParent, offset + rendered.domNodesCount));
        
        return rendered;
    }
    
    // String element. Or anything else, which we will coerce to string (e.g. number)
    else {
        const node = document.createTextNode(String(elementSpec));
        appendChild(node, domParent, offset);
        
        // Update parents' DOM node count
        updateParentsDomNodeCount(parent, 1);
        
        return {
            type: 'text',
            value: elementSpec,
            parent,
            dom: node,
            domNodesCount: 1
        }
    }
    
}


/**
* Returns whether a Shmeact element is compatible with an updated spec
*/
function canUpdate(existing: ShmeactElement | null, updated: ShmeactElementSpec | null): existing is ShmeactElement {
    return Boolean(existing && updated !== null
        && (
            (isDomElement(existing) && isDomElement(updated) && existing.component === updated.component)
            || (isComponentElement(existing) && isComponentElement(updated) && existing.component === updated.component)
            || (isArrayElement(existing) && Array.isArray(updated))
            || (isStringElement(existing))))
}


/**
* Used when the component already exists but props or children have changed
* We always keep the original object and update it, to avoid losing state
*/
function update(existing: ShmeactElement, updated: ShmeactElementSpec): void {
    // String element update
    if (isStringElement(existing)) {
        existing.value = updated as ShmeactStringElementSpec;
        existing.dom!.data = String(updated);
    }
    
    // Component element update
    else if (isComponentElement(existing) && isComponentElement(updated)) {
        // Update props
        existing.props = updated.props;
        // Update children
        existing.children = updated.children;
        // Rerender
        renderComponentElement(existing); // This also reconciles
    }
    
    // DOM element update
    else if (isDomElement(existing) && isDomElement(updated)) {
        // Update children
        updateChildren(existing, updated.children ?? []);

        // Update attributes
        updateDomElementAttributes(existing.dom, existing.props, updated.props);

        // Update vdom props
        existing.props = updated.props;
    }
    
    // Array - we just need to match the child components correctly, same as for DOM node children
    else if (isArrayElement(existing) && Array.isArray(updated))
        updateChildren(existing, updated);
}

/**
* Reconcile an array of child elements. Elements could be added, removed, updated, or moved
*/
function updateChildren(element: ShmeactDomElement | ShmeactArrayElement, updatedChildren: ShmeactElementSpec[]) {
    let domParent: Element, offset: number;
    if (isDomElement(element)) {
        domParent = element.dom;
        offset = 0;
    } else {
        [domParent, offset] = getDomParentAndOffset(element);
    }
    
    // We match based on element type, component type, and order in the array
    // So we need to keep track of which ones we've seen
    
    // Make sure we don't match the same existing one twice
    const reconciled = new Set<ShmeactElement>;
    // Keep track of how many 'null' components we got, to adjust the array index
    let nulls = 0;
    // Iterate through updated
    for (let [newIndex, child] of updatedChildren.entries()) {
        // Skip te nulls but keep track
        if (child === null) {
            nulls++;
            continue;
        }
        
        newIndex -= nulls; // The index we want it to end up in
        
        // See if we have it in existing
        const existing = findMatching(child, element.childNodes, reconciled);
        // If we don't, create it
        if (!existing) {
            const created = create(child, element, domParent, offset);
            element.childNodes.splice(newIndex, 0, created);
            offset += created.domNodesCount;
            reconciled.add(created);
        } else {
            // If we do,
            // Update it
            update(existing, child);
            // Reorder it if necessary
            const oldIndex = element.childNodes.indexOf(existing); 
            if (oldIndex !== newIndex) {
                // Do the move in the VDOM
                element.childNodes.splice(newIndex, 0, element.childNodes.splice(oldIndex, 1)[0]);
                // Do the move in the DOM
                move(existing, domParent, offset);
            }
            // Update the offset
            offset += existing.domNodesCount;
            // Add it to the used set
            reconciled.add(existing);
        }
    }
    // Anything left in existing, remove
    for (const originalChild of element.childNodes)
        if (!reconciled.has(originalChild)) {
            remove(originalChild);
            element.childNodes.splice(element.childNodes.indexOf(originalChild), 1);
        }
}

function updateDomElementAttributes(element: Element, oldProps: ShmeactProps | null, newProps: ShmeactProps | null): void {
    oldProps = oldProps ?? {};
    newProps = newProps ?? {};

    for (const [k, v] of Object.entries(newProps)) {
        // Ref
        if (k === 'ref' && !oldProps.ref && 'current' in (v as Ref))
            (v as Ref).current = element;

        if (internalProps.includes(k)) // includes ref
            continue;

        if (v !== oldProps[k]) { // Changed or added
            if (k.startsWith('on')) { // Event
                // Event
                const eventName = k.slice(2).toLowerCase();
                // Need to remove the old one if there is one
                if (oldProps[k])
                    element.removeEventListener(eventName, oldProps[k]);
                // Add the new one
                element.addEventListener(eventName, v as EventListenerOrEventListenerObject);

            } else if (k === 'style') { // Style is a special case
                const oldStyle: any = oldProps.style ?? {};
                for (const [sk, sv] of Object.entries(v as CSSStyleDeclaration))
                    if (sv !== oldStyle[sk])
                        //@ts-ignore Add or update style
                        element.style[sk] = sv;
                for (const sk of Object.keys(oldStyle))
                    if (!(sk in (v as CSSStyleDeclaration)))
                        //@ts-ignore Been removed
                        element.style[sk] = null;

            } else { // Anything else
                //@ts-ignore because we're not checking which attributes are valid
                element[k] = v;
            }
        }
    }
    // Check for removed
    for (const [k, v] of Object.entries(oldProps))
        if (!internalProps.includes(k) && v !== null && v !== undefined && !(k in newProps))
            if (k === 'ref' && 'current' in (v as Ref))
                (v as Ref).current = undefined;
            else if (k.startsWith('on'))
                element.removeEventListener(k.slice(2).toLowerCase(), v as EventListenerOrEventListenerObject);
            else if (k === 'style')
                for (const sk of Object.keys(v))
                    //@ts-ignore
                    element.style[sk] = undefined;
            else
                //@ts-ignore
                element[k] = undefined;
}


/**
* Find the equivalent real element from an array, given an element spec
*/
function findMatching(source: ShmeactElementSpec, targetArray: ShmeactElement[], used: Set<ShmeactElement>): ShmeactElement | undefined {
    // Try to find the rendered element in the array that matches the provided element spec
    // Respect the 'key' prop if it is set
    if (isDomElement(source))
        return targetArray.find(e => !used.has(e) && isDomElement(e) && e.component === source.component && e.props?.key === source.props?.key);
    if (isComponentElement(source))
        return targetArray.find(e => !used.has(e) && isComponentElement(e) && e.component === source.component && e.props?.key === source.props?.key);
    if (Array.isArray(source))
        return targetArray.find(e => !used.has(e) && isArrayElement(e));
    else // Text element
        return targetArray.find(e => !used.has(e) && isStringElement(e));
}

/**
* Move the elements to a different position under the parent
* @return The number of elements moved
*/
function move(element: ShmeactElement, domParent: Element, offset: number): number {
    if (isDomElement(element) || isStringElement(element)) {
        // These are already real DOM nodes. Move them and finish
        // No need to move their children, they come with them
        appendChild(element.dom, domParent, offset);
        return 1;
    }
    else if (isComponentElement(element) && element.rendered)
        return move(element.rendered, domParent, offset);
    else if (isArrayElement(element)) {
        let moved = 0;
        for (const child of element.childNodes)
            moved += move(child, domParent, offset + moved);
        return moved;
    }

    return 0;
}

/**
* Used when the component no longer exists
* This does NOT remove `element` from its own parent in the virtual DOM
*/
function remove(element: ShmeactElement, skipDomRemoval: boolean = false) {
    // Null the ref if there is one
    if ((isDomElement(element) || isComponentElement(element)) && element.props?.ref?.current)
        element.props.ref.current = null;

    // Remove children
    if ((isDomElement(element) || isArrayElement(element)) && element.childNodes) {
        // Optimization: If this is a DOM element, we don't need to remove child DOM elements,
        // since removing the parent will remove them too
        const childSkipDomRemoval = skipDomRemoval || isDomElement(element);
        element.childNodes.forEach(child => remove(child, childSkipDomRemoval));
        element.childNodes = [];
    }

    // Remove the DOM element itself
    if (!skipDomRemoval && (isDomElement(element) || isStringElement(element))) {
        element.dom.remove();
        // Update parents' DOM node count
        updateParentsDomNodeCount(element.parent!, -1)
    }
    
    // Remove rendered component
    if (isComponentElement(element)) {
        if (element.rendered) {
            remove(element.rendered, skipDomRemoval);
            element.rendered = null;
        }
        // Run any teardown effects
        for (const effect of element.effects)
            try {
                effect.teardown?.();
            } catch (e) {
                console.error('Error running effect teardown', e);
            }
    }
}


// Reconciliation utility functions 

function appendChild(node: Node, parent: Element, offset: number): void {
    // Attach to real DOM
    if (!offset)
        parent.prepend(node);
    else
        parent.childNodes[offset - 1].after(node);
}

/**
* Utility function to find, for a given Shmeact element, who its immediate real (DOM) parent is,
* and how many real (DOM) older siblings it has
*/ 
function getDomParentAndOffset(element: ShmeactElement): [Element, number] {
    // Keep moving up the tree until we hit a ShmeactDomElement. That will be the parent.
    // As we go, add up the domElement counts of the older siblings to this element. That will be the offset.
    let currentElement = element;
    let currentParent: ParentElement = element.parent!;
    let offset = 0;
    do {
        // Component and root elements only have one child so there is no offset to add
        if (isDomElement(currentParent) || isArrayElement(currentParent)) {
            for (const sibling of currentParent.childNodes) {
                if (sibling === currentElement)
                    break;
                offset += sibling?.domNodesCount ?? 0;
            }
        }
        if (!isDomElement(currentParent) && !isRootElement(currentParent))
            currentParent = currentParent.parent!;
    } while (!isDomElement(currentParent) && !isRootElement(currentParent));

    return [currentParent.dom!, offset];
}

function updateParentsDomNodeCount(parent: ParentElement, delta: number): void {
    while (!isDomElement(parent) && !isRootElement(parent)) {
        parent.domNodesCount += delta;
        parent = parent.parent!;
    }
}



// Component render process

// Need to know which one is currently rendering, to handle hooks
let currentlyRenderingElement: ShmeactComponentElement | null = null,
currentStateIndex: number, currentEffectIndex: number, currentLayoutEffectIndex: number, currentRefIndex: number, currentMemoIndex: number,
currentEffectQueue: Effect[], currentLayoutEffectQueue: Effect[];

/**
* Render a Shmeact component
* This function expects that the component is already attached to the Vdom
*/
function renderComponentElement(element: ShmeactComponentElement, domParent?: Element, offset?: number): ShmeactElementSpec {
    // Set up global variables
    currentlyRenderingElement = element;
    currentStateIndex = currentEffectIndex = currentLayoutEffectIndex = currentRefIndex = currentMemoIndex = 0;
    // Since a parent component may be in the middle of rendering and have its effect queue
    // we swap them and swap them back at the end
    const oldEffectQueue = currentEffectQueue;
    currentEffectQueue = [];
    const oldLayoutEffectQueue = currentLayoutEffectQueue;
    currentLayoutEffectQueue = [];

    // Do the render
    const {component, props, children} = element;
    const renderResult = component({...props, children}) ?? null;
    // React used to enforce returning null, not undefined
    // The rest of Shmeact only checks for null, so coerce undefined to null
    // just in case someone got it wrong

    currentlyRenderingElement = null;

    // Reconcile the result to the DOM
    if (!domParent || !offset)
    [domParent, offset] = getDomParentAndOffset(element);

    const existing = element.rendered ?? null;

    // If the types are the same, update the existing element
    if (canUpdate(existing, renderResult))
        update(existing, renderResult);

    // Otherwise, it's not the same type of component, we need to remove and re-add (or just remove or just add)
    else {
        // Remove existing if any
        if (element.rendered)
            remove(element.rendered);
        // Add new
        element.rendered = renderResult !== null
            ? create(renderResult, element, domParent, offset)
            : null;
    }

    // Done rendering and reconciling to DOM. Run effects

    // Layout effects run before next paint
    if (currentLayoutEffectQueue.length > 0) {
        const myLayoutEffectQueue = currentLayoutEffectQueue;
        window.requestAnimationFrame(() => myLayoutEffectQueue.forEach(runEffect));
    }
    // Regular effects run on next tick
    if (currentEffectQueue.length > 0) {
        const myEffectQueue = currentEffectQueue;
        window.setTimeout(() => myEffectQueue.forEach(runEffect));
    }

    // Restore previous effect queue
    currentEffectQueue = oldEffectQueue;
    currentLayoutEffectQueue = oldLayoutEffectQueue;

    return renderResult;
}


// Hooks

type SetStateFunction<T> = ((newval: T | ((oldval: T) => T)) => void)

export function useState<T>(initital: T): [T, SetStateFunction<T>];
export function useState<T>(): [T|undefined, SetStateFunction<T>];
export function useState<T>(initial?: T) {
    if (!currentlyRenderingElement)
        throw new Error('Called useState outside of render');
    
    // Retrieve the currently rendering element
    const element = currentlyRenderingElement,
    // Index in the state array (and increase the index for next time)
          index = currentStateIndex++;

    // Add to the state array if this is the first time
    if (element.state.length <= index)
        // New state entry
        element.state[index] = initial;

    // Keep current value handy for the set state function
    const currentValue = element.state![index];
    
    const setStateFunction = (newValue: any) => {
        // A set state function can accept either a new value,
        // or a function that gets passed the old value and returns the new one
        if (typeof newValue === 'function')
            newValue = newValue(currentValue);
        
        element.state[index] = newValue;
        
        // Rerender the component with the new state
        renderComponentElement(element);
    }
    
    return [element.state[index], setStateFunction];
}

export function useEffect(effect: EffectFunction, deps?: any[]): void {
    useEffectShared('effects', currentEffectIndex++, currentEffectQueue, effect, deps);
}
export function useLayoutEffect(effect: EffectFunction, deps?: any[]): void {
    useEffectShared('layoutEffects', currentLayoutEffectIndex++, currentLayoutEffectQueue, effect, deps);
}
function useEffectShared(effectArrayProperty: 'effects'|'layoutEffects', index: number, effectQueue: Effect[], effect: EffectFunction, deps?: any[]): void {
    if (!currentlyRenderingElement)
        throw new Error('Called useEffect outside of render');
    
    const effectArray = currentlyRenderingElement[effectArrayProperty];

    let entry = effectArray[index];
    // If this is the first time, add it to the effects array
    // and the queue for effects to run
    if (!entry) {
        entry = effectArray[index] = {effect, deps};
        effectQueue.push(entry);
    } else if (depsChanged(entry.deps, deps)) {
        // Dependencies changed - replace effect and deps, and add to queue to run
        entry.effect = effect;
        entry.deps = deps;
        effectQueue.push(entry);
    }
}


export function useRef<T = any>(): Ref<T|undefined>;
export function useRef<T = any>(initial: T): Ref<T>;
export function useRef<T = any>(initial?: T): Ref<T> {
    if (!currentlyRenderingElement)
        throw new Error('Called useRef outside of render');
    
    const index = currentRefIndex++;
    
    if (currentlyRenderingElement.refs.length <= index)
        currentlyRenderingElement.refs[index] = {current: initial};
    
    return currentlyRenderingElement.refs[index];
}

/**
* Used when you want to have a ref to a Shmeact component element
*/
export function forwardRef<T extends ShmeactProps>(component: (restPops: T, ref: Ref) => ShmeactElementSpec): ShmeactComponent<T & {ref?: Ref}> {
    return (props: T & {ref?: Ref}) => {
        let {ref, ...rest} = props;
        return component(rest as T, ref ?? {current: undefined});
    }
}

/**
* When there is a ref to a Shmeact component element, this sets what the ref should do
*/
export function useImperativeHandle(ref: Ref, handle: any): void {
    ref.current = handle;
}

export function useMemo<T = any>(fn: () => T, deps: any[]): T {
    if (!currentlyRenderingElement)
        throw new Error('Called useMemo outside of render');
    
    const element = currentlyRenderingElement,
          index = currentMemoIndex++;

    // Update if new or if deps changed
    if (element.memos.length <= index || depsChanged(element.memos[index].deps, deps))
        element.memos[index] = { value: fn(), deps };
    
    // Return the value
    return element.memos[index].value;
}

// This is straight from the React docs!
export function useCallback(fn: () => {}, deps: any[]) {
    return useMemo(() => fn, deps);
}

interface Context<T> {
    Provider: ShmeactComponent<{context: T}>;
    defaultValue: T;
}
export function createContext<T>(defaultValue: T): Context<T> {
    return {
        Provider: ({children}) => children ?? null,
        defaultValue
    };
}
export function useContext<T>(context: Context<T>): T {
    if (!currentlyRenderingElement)
        throw new Error('Called useContext outside of render');
    // Walk up the component tree, looking for a provider
    let currentParent = currentlyRenderingElement.parent;
    while (currentParent && !isRootElement(currentParent)) {
        if (isComponentElement(currentParent) && currentParent.component === context.Provider)
            return currentParent.props!.context as T;
        currentParent = currentParent.parent;
    }
    // If we don't find one, return the default value
    return context.defaultValue;
}


// Utility functions to help with Hooks

function depsChanged(oldDeps: any[] | undefined, newDeps: any[] | undefined): boolean {
    if (!oldDeps || !newDeps)
        return true;
    if (oldDeps.length !== newDeps.length)
        return true;
    return oldDeps.some((value, index) => value !== newDeps[index]);
}

function runEffect(effectDef: Effect): void {
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


// Like the React fragment
// Returns an array of the children
export const Fragment = ({children}: {children: ShmeactElement[]}) => children;
