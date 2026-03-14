/**
 * Resolves a public-folder asset path for the current build environment.
 * - Dev (`npm run dev`): returns the path with a leading slash (e.g. "/textures/foo.png")
 * - Production build: returns the path without a leading slash (e.g. "textures/foo.png"),
 *   so that relative paths work correctly when deployed to a subdirectory.
 */
export function publicUrl(path: string): string {
  const clean = path.startsWith("/") ? path.slice(1) : path;

  return import.meta.env.DEV ? `/${clean}` : clean;
}
