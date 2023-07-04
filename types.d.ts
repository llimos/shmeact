declare namespace JSX {
    interface ExtraProps {
        key: any;
        ref: {current: Element | undefined};
    }
    
    interface ElementExtensions {
        input: {value: any};
    }
    
    type ShmeactifyEventName<E> = E extends `on${infer N}` ? `on${Capitalize<N>}` : E;
    type ShmeactifyElement<E> = {
        [K in keyof E as ShmeactifyEventName<K>]: Partial<E[K]>
    }

    // This is the one TypeScript uses internally to validate JSX
    // React has its own set of HTML validators but we're lazy so we're using TypeScript's
    type IntrinsicElements = {
        [K in keyof HTMLElementTagNameMap]:
            Partial<
                Omit<ShmeactifyElement<HTMLElementTagNameMap[K]>,
                    keyof ElementExtensions[K & keyof ElementExtensions]
                    & keyof ExtraProps>
                & ExtraProps
                & (K extends keyof ElementExtensions ? ElementExtensions[K & keyof ElementExtensions] : {})
            >;
    }
}
