/// <reference types="vite/client" />

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
