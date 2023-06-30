# Shmeact
Shmeact is an attempt to create a simple, rudimentary version of React with zero dependencies.

## Motivation
Mainly to support the assertion that React is easier to reason about than compiler-based alternatives such as Vue and Svelte. I suggested that I could imagine building a rudimentary version of React myself, which is not the case for Vue and Svelte. A friend challenged me to put my money where my mouth is, and here is the result 😀

It also turned out to be an interesting project anyway.

Don't use in production unless you're insane.

## Usage
To try it out, first check out the repo

    git clone https://github.com/llimos/shmeact.git
Install using your package manager of choice (There are no runtime dependencies, and the only dev dependency is Typescript, with serve is also included for easy viewing)

    yarn install
    npm install
Build

    yarn build
    npm run build
Serve

    yarn start
    npm run start
Watch mode is also available as an alternative to building

    yarn watch
    npm run watch

Start coding! The library is in shmeact.ts, and your code is in index.ts. Use it just like React.

## What's supported
* JSX, with Typescript configured appropriately
* React basics - components, rendering, etc.
* `useState`
* `useEffect`
* `key` prop for matching elements during reconciliation

Other hooks might be added later, but there's enough here to prove the concept.

## Differences from React
Lots, obviously 🙂

In terms of the function names, there is no separate ShmeactDOM package. Use `domRender` and `domUnmount` instead.

## Why "Shmeact"?
Shmeact stands for *Shimon's Minimal React*. But it's equally appropriate as a response to those who say "React, shmeact!" This is the Shmeact of which they speak.
