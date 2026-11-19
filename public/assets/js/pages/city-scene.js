/** Maquette illustrative. Pas de boucle WebGL ; on redessine sur demande. */
import {
  AmbientLight, BoxGeometry, Color, CylinderGeometry, DirectionalLight, Group,
  InstancedMesh, Mesh, MeshStandardMaterial, Object3D, OrthographicCamera,
  PlaneGeometry, Scene, ShaderMaterial, WebGLRenderer,
} from "../../vendor/three-city.mjs";

const reliefVertex = `
  varying vec2 pos;
  void main() {
    pos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const reliefFragment = `
  varying vec2 pos;
  void main() {
    float r = length(pos * vec2(0.8, 1.2)) + .2 * sin(pos.x * 1.7 + pos.y);
    float contours = 1.0 - smoothstep(0.02, 0.16, abs(fract(r * 2.0) - .5));
    vec3 base = vec3(.025, .12, .077);
    gl_FragColor = vec4(base + vec3(.02, .125, .072) * contours, 1.0);
    #include <colorspace_fragment>
  }
`;

export function mountCityScene(host, { onLost } = {}) {
  const stage = host.parentElement;
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  const canvas = renderer.domElement;
  const scene = new Scene();
  scene.background = new Color(0x071713);
  const camera = new OrthographicCamera(-6, 6, 5, -5, .1, 40);
  const model = new Group();
  scene.add(model, new AmbientLight(0xd9ffe4, 1.5));
  const sun = new DirectionalLight(0xffeed0, 3.4);
  sun.position.set(5, 9, 4);
  scene.add(sun);
  const stone = new MeshStandardMaterial({ color: 0x163b2a, roughness: .74 });
  const island = new Mesh(new CylinderGeometry(4, 3.8, .52, 8), stone);
  island.position.y = -.26;
  model.add(island);
  const relief = new Mesh(new PlaneGeometry(5.05, 5.05), new ShaderMaterial({ vertexShader: reliefVertex, fragmentShader: reliefFragment }));
  relief.rotation.x = -Math.PI / 2;
  relief.position.y = .017;
  model.add(relief);

  const colors = [0x61b785, 0xddbd67, 0xa2cdbc, 0x397759];
  const buildings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: .58, metalness: .13 }), 40);
  const obj = new Object3D();
  for (let i = 0; i < buildings.count; i++) {
    const side = i % 8;
    const row = Math.floor(i / 8);
    const x = (side - 3.5) * .57;
    const z = (row - 2) * .84;
    const height = .22 + (Math.sin(i * 8.73) + 1) * (.3 + .5 * Math.exp(-.25 * (x * x + z * z)));
    obj.position.set(x, height / 2 + .035, z);
    obj.scale.set(.32 + (i % 3) * .075, height, .39 + (i % 4) * .027);
    obj.updateMatrix();
    buildings.setMatrixAt(i, obj.matrix);
    buildings.setColorAt(i, new Color(colors[(i * 7 + row) % colors.length]));
  }
  buildings.instanceMatrix.needsUpdate = true;
  buildings.instanceColor.needsUpdate = true;
  model.add(buildings);

  let angle = .66;
  let disposed = false;
  const draw = () => {
    if (disposed) return;
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = width / height;
    const size = Math.max(3.55, 4.6 / ratio);
    camera.left = -ratio * size;
    camera.right = ratio * size;
    camera.top = size;
    camera.bottom = -size;
    camera.updateProjectionMatrix();
    camera.position.set(9 * Math.sin(angle), 7, 9 * Math.cos(angle));
    camera.lookAt(0, .43, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    renderer.setSize(Math.round(width), Math.round(height), false);
    renderer.render(scene, camera);
  };
  const onContextLost = () => onLost?.();
  const observer = new ResizeObserver(draw);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    buildings.dispose();
    model.traverse((child) => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
  try {
    host.appendChild(canvas);
    draw();
    canvas.addEventListener("webglcontextlost", onContextLost);
    observer.observe(stage);
    return { rotate() { angle += Math.PI / 4; draw(); }, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
