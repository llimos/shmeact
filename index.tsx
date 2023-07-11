// If Typescript causes you problems, and you can't or don't want to fix them, or you're not a TS person,
// remove the space after the @ from the comment below to disable it
//@ ts-nocheck

//import {createElement, Fragment, createRoot, domRender, domUnmount, useEffect, useState, useRef, createContext, useContext, forwardRef, useImperativeHandle} from "./shmeact.js";
import {createElement, Fragment, createRoot, domRender, domUnmount, useEffect, useState, useRef, createContext, useContext, forwardRef, useImperativeHandle} from "./shmOOact.js";

const MyContext = createContext('No context provided!');

const MyComponent = ({onUnmount}: {onUnmount: () => void}) => {
    return <div className="hi">
            <h1>hello <b>world</b></h1>
            <Clock />
            <UnmountButton onUnmount={onUnmount} />
            <CSSChooser/>
            <List/>
            <Counter/>
            <RefTester/>
            <h3>Context</h3>
            <MyContext.Provider context={'This is context A'}>
                <ContextTester label="should be A" />
            </MyContext.Provider>
            <ContextTester label="should be default" />
            <ImperativeHandleTester />
        </div>;
}

const Clock = () => {
    const [now, setNow] = useState(new Date);
    useEffect(() => {
        const handle = window.setInterval(() => setNow(new Date), 1000);

        return () => window.clearInterval(handle);
    }, []);
    return <div>
        The current time is {now.toLocaleString()}
    </div>;
}

const UnmountButton = ({onUnmount}: {onUnmount: () => void}) =>
    <p>This is a{' '}
        <button type="button" onClick={onUnmount}>button</button>.
        Click it to unmount {'everything'}
    </p>;

const CSSChooser = () => {
    const [css, setCss] = useState<string>("https://unpkg.com/boltcss/bolt.min.css");
    useEffect(() => {
        (document.getElementById('main-css') as HTMLLinkElement)!.href = css
    }, [css]);
    const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
    const [darkMode, setDarkMode] = useState<boolean>(systemDarkMode.matches);
    useEffect(() => {
        const listener = (e: MediaQueryListEvent) => setDarkMode(e.matches);
        systemDarkMode.addEventListener('change', listener);
        return () => systemDarkMode.removeEventListener('change', listener);
    }, [])

    return <div>
        <h3>Choose CSS</h3>
        <div style={{display: 'flex', gap: '5px'}}>
        <select onChange={(e: InputEvent) => setCss((e.target as HTMLSelectElement)!.value)} value={css}>
            <option value="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css">Water</option>
            <option value="https://unpkg.com/boltcss/bolt.min.css">Bolt</option>
            <option value="https://classless.de/classless.css">Classless</option>
            <option value="https://cdn.jsdelivr.net/npm/@exampledev/new.css@1.1.2/new.min.css">New</option>
            <option value="https://unpkg.com/concrete.css@2.0.3/concrete.css">Concrete</option>
            <option value="https://unpkg.com/sakura.css/css/sakura.css">Sakura</option>
        </select>
        <p>Dark mode is <b>{darkMode ? 'ON' : 'OFF'}</b></p>
        </div>
    </div>
}

const List = () => {
    const [reverseElementOrder, setReverseElementOrder] = useState(false);
    const [randomOrder, setRandomOrder] = useState(false);
    
    const listElements = [1, 2, 3, 4, 5].map(n => <li key={n}>Item {n} <input placeholder="Type here to prove it's the same element being moved" style={{width: '500px', maxWidth: 'none'}}/></li>);
    
    if (randomOrder)
        listElements.sort(() => 0.5 - Math.random());
    else if (reverseElementOrder)
        listElements.reverse();
    
    return <>
        <h3>List</h3>
        <ul>
            {listElements}
        </ul>
        <label>
            <input type="checkbox" disabled={randomOrder} value={reverseElementOrder} onChange={(e: any) => setReverseElementOrder(e.target.checked)} />
            Reverse element order (used for testing reordering existing elements) <b>{!randomOrder && reverseElementOrder ? 'ON' : 'OFF'}</b>
        </label>
        <label>
            <input type="checkbox" value={randomOrder} onChange={(e: any) => setRandomOrder(e.target.checked)} />
            Random order <b>{randomOrder ? 'ON' : 'OFF'}</b>
        </label>
    </>
}

const Counter = () => {
    const [count, setCount] = useState(0);
    
    useEffect(() => {
        if (count > 0 && count % 10 === 0)
            alert(`Well done! You got to ${count}`);
        }, [count]);
    
    return <div>
        <h3>Counter</h3>
        <CounterDisplay count={count}/>
        <p>
            <button type="button" onClick={() => setCount(count + 1)}>Increase</button>
        </p>
    </div>
}

const CounterDisplay = ({count}: {count: number}) => <div className="hi">The count is {count}</div>

const RefTester = () => {
    const myRef = useRef<HTMLInputElement>();
    useEffect(() => console.dir(myRef.current), [myRef.current]);
    
    return <div>
        <h3>Uncontrolled element with ref</h3>
        <input ref={myRef} />
        <button onClick={() => alert(myRef.current!.value)}>Show value</button>
    </div>;
}

const ContextTester = ({label}: {label: string}) => {
    const value = useContext(MyContext);
    return <div>
        Context value ({label}): <b>{value}</b>
    </div>;
}

const ImperativeHandleTester = () => {
    const ref = useRef();
    const focusInnerInput = () => ref.current?.focusInput();
    return <div>
        <h3>Test Imperative Handle</h3>
        <p>
            <button type="button" onClick={focusInnerInput}>Click to focus the input box</button>
        </p>
        <p>
            <ImperativeHandleInner ref={ref} />
        </p>
    </div>;
}

const ImperativeHandleInner = forwardRef((props, ref) => {
    const inputRef = useRef<HTMLInputElement>();
    useImperativeHandle(ref, {
        focusInput() { inputRef.current?.focus(); }
    });
    return <input placeholder="Click the button to focus me" ref={inputRef} />
});


// Render it
const rootElement = document.getElementById('app-root')!;
// There's the old and new API's available. Only use one!
// We pass in the unmount function as a prop, since there's a button to unmount it, and it needs to know

// Old API
//domRender(rootElement, <MyComponent onUnmount={() => domUnmount(rootElement)}/>);

// New API
const root = createRoot(document.getElementById('app-root')!);
root.render(<MyComponent onUnmount={() => root.unmount()}/>);