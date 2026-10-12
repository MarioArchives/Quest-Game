// `@pack` resolves (vite.config.ts alias) to the look half of the pack picked by VITE_GAME_PACK.
declare module '@pack' {
  const look: import('./types').PackLook;
  export default look;
}
