// hero.vert.glsl
//
// The "big triangle" fullscreen trick: instead of two triangles forming a
// quad (which has a diagonal seam where they meet — invisible here, but a
// classic source of subtle artifacts in more complex shaders), one
// triangle with vertices *larger* than clip space (-1..1) covers the
// entire screen after GL clips off the overhanging corners. Cheaper (3
// vertices instead of 6) and seam-free.
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
