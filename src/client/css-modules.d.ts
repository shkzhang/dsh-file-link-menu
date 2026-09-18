/**
 * Declaration for the CSS-module imports the client bundle compiles.
 *
 * The build's CSS step turns `x.module.css` into a module that injects its
 * sheet and exports the (hashed) class map. This plugin's sheets are keyed off
 * stamped attributes rather than classes, so a side-effect import is all any
 * call site needs.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
