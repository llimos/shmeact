import {createElement, Fragment, domRender, domUnmount, useEffect, useState, useRef} from "./shmeact.js";

const MyComponent = () => {
    return <div className="hi">
        <h1>hello <b>world</b></h1>
        <p>This is a <button type="button" onClick={() => domUnmount(document.getElementById('app-root')!)}>button</button>. Click it to unmount {'everything'}</p>
        <List/>
        <Counter/>
        <RefTester/>
    </div>;
}

const List = () => {
    const [reverseElementOrder, setReverseElementOrder] = useState(false);
    const [randomOrder, setRandomOrder] = useState(false);
    
    const listElements = [1, 2, 3, 4, 5].map(n => <li key={n}>Item {n}</li>);
    
    if (randomOrder)
        listElements.sort(() => 0.5 - Math.random());
    else if (reverseElementOrder)
        listElements.reverse();
    
    return <>
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
    useEffect(() => console.dir(myRef.current));
    
    return <div>
        <h3>Uncontrolled element with ref</h3>
        <input ref={myRef} />
        <button onClick={() => alert(myRef.current!.value)}>Show value</button>
    </div>;
}

// Render it
domRender(document.getElementById('app-root')!, <MyComponent/>);