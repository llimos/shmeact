# Shmeact
Shmeact is an attempt to create a simple, rudimentary version of React with zero dependencies.

## Motivation
I wrote this mainly to support the assertion that React is easier to reason about than compiler-based alternatives such as Vue and Svelte. I suggested that I could imagine building a rudimentary version of React myself, which is not the case for Vue and Svelte. A friend challenged me to put my money where my mouth is, and here is the result 😀

It also turned out to be an interesting project anyway, and useful for understanding how React works.

Don't use in production unless you're insane.

## Usage
To try it out, first check out the repo

    git clone https://github.com/llimos/shmeact.git
Install using your package manager of choice (There are no runtime dependencies, and the only dev dependency is Typescript)

    yarn install
    npm install
Build

    yarn build
    npm run build
Serve

    npx serve
Watch mode is also available as an alternative to building

    yarn watch
    npm run watch

Start coding! The library is in shmeact.ts, and your code is in index.ts. Use it just like React.

Note that DOM element typings come from TypeScript, and may differ slightly in React or have bugs. If this is the case, edit the `types.d.ts` file accordingly.

## What's supported
* JSX, with Typescript configured appropriately
* React basics - function components, rendering, etc.
* `key` prop for matching elements during reconciliation
* `useState` and `useReducer` hooks
* `useEffect` and `useLayoutEffect` hooks
* `useRef` hook, the `ref` prop for DOM and component elements, and `forwardRef` and `useInvocationHandler` for component element refs
* `useMemo` hook
* `useCallback` hook
* Context, through `createContext` and the `useContext` hook
* Memoized components through `memo(Component)`

Other hooks might be added later, but there's enough here to prove the concept.

## Differences from React
Lots, obviously 🙂

I did not look at the React source code, or technical writeups on how React does it. This implementation is based on my understanding of how React works, how I understood it at the time the challenge was issued.

React will do much better in terms of performance, and error handling.
Shmeact doesn't check for anything you're doing wrong - e.g. breaking the Rules of Hooks, setting state from a render method and so on.
It will probably just blow up spectacularly.

But if you have conformant React code, it should work fine.

Class components and error boundaries are not supported.

In terms of the function names, there is no separate ShmeactDOM package. Use `domRender` and `domUnmount` instead.

Also, Shmeact doesn't do the special case properties that React does - e.g. `value` on an `<select>` instead of looking for `selected` on the `<option>`. What's in the DOM is what you get.

Automatic JSX imports don't work either, you need to import `{createElement}` and `{Fragment}` yourself at the top of the file.

## Why "Shmeact"?
Shmeact stands for *Shimon's Minimal React*. But it's equally appropriate as a response to those who say "React, shmeact!" This is the Shmeact of which they speak.
