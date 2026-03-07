export type Compute<type> = { [key in keyof type]: type[key] } & unknown
