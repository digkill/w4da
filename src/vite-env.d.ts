/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MULTIPLAYER_ENABLED?: string;
  readonly VITE_WS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.glb?url" {
  const src: string;
  export default src;
}
declare module "*.gltf?url" {
  const src: string;
  export default src;
}
declare module "*.png?url" {
  const src: string;
  export default src;
}
declare module "*.mp3?url" {
  const src: string;
  export default src;
}
