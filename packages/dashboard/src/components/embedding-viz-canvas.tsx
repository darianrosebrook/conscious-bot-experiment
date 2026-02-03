import { useEffect, useRef, useState } from 'react';
import type { EmbeddingPoint3D } from '@/types';

// Color mapping by memory type - brighter colors for dark background
const TYPE_COLORS: Record<string, string> = {
  episodic: '#60a5fa', // blue
  semantic: '#4ade80', // brighter green
  procedural: '#f472b6', // pink
  emotional: '#fbbf24', // amber
  social: '#c4b5fd', // brighter purple
  thought: '#67e8f9', // cyan (more distinctive)
  unknown: '#9ca3af', // lighter gray
};

export interface EmbeddingVizCanvasProps {
  points: EmbeddingPoint3D[];
  selectedId: string | null;
  onSelect: (point: EmbeddingPoint3D | null) => void;
  onCanvasClick: () => void;
}

// Define the Web Component class as a string to be injected
const WEB_COMPONENT_CODE = `
class EmbeddingVizElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._points = [];
    this._selectedId = null;
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._controls = null;
    this._instancedMesh = null;
    this._animationId = null;
    this._THREE = null;
    this._OrbitControls = null;
  }

  static get observedAttributes() {
    return ['points', 'selected-id'];
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = \`
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
        canvas {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          font-family: system-ui, sans-serif;
        }
      </style>
      <div class="loading">Loading 3D engine...</div>
    \`;
    this._loadThreeJS();
  }

  disconnectedCallback() {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }
    if (this._renderer) {
      this._renderer.dispose();
    }
    if (this._controls) {
      this._controls.dispose();
    }
  }

  async _loadThreeJS() {
    try {
      // Dynamically import Three.js
      const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
      const { OrbitControls } = await import('https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js');

      this._THREE = THREE;
      this._OrbitControls = OrbitControls;

      this._initScene();
      // Points may have been set before Three.js loaded - render them now
      if (this._points.length > 0) {
        console.log('[EmbeddingViz] Rendering', this._points.length, 'points after Three.js loaded');
      }
      this._updatePoints();
      this._animate();

      // Dispatch event to notify that rendering is ready
      this.dispatchEvent(new CustomEvent('three-ready', { bubbles: true, composed: true }));
    } catch (error) {
      console.error('Failed to load Three.js:', error);
      this.shadowRoot.innerHTML = '<div class="loading">Failed to load 3D engine</div>';
    }
  }

  _initScene() {
    const THREE = this._THREE;
    const container = this.shadowRoot;

    // Clear loading message
    container.innerHTML = \`
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
        canvas {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }
      </style>
    \`;

    // Scene
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    const width = this.clientWidth || 400;
    const height = this.clientHeight || 300;
    this._camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this._camera.position.set(12, 8, 12);

    // Renderer
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setSize(width, height);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this._renderer.domElement);

    // Controls
    this._controls = new this._OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.05;
    this._controls.minDistance = 3;
    this._controls.maxDistance = 30;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this._scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0xffffff, 0.8);
    pointLight1.position.set(10, 10, 10);
    this._scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xffffff, 0.3);
    pointLight2.position.set(-10, -10, -10);
    this._scene.add(pointLight2);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
    this._scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(6);
    this._scene.add(axesHelper);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      const w = this.clientWidth;
      const h = this.clientHeight;
      if (w > 0 && h > 0) {
        this._camera.aspect = w / h;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(this);

    // Handle click for selection
    this._renderer.domElement.addEventListener('click', (event) => {
      this._handleClick(event);
    });
  }

  _handleClick(event) {
    if (!this._instancedMesh || !this._points.length) return;

    const THREE = this._THREE;
    const rect = this._renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this._camera);

    const intersects = raycaster.intersectObject(this._instancedMesh);

    if (intersects.length > 0) {
      const instanceId = intersects[0].instanceId;
      if (instanceId !== undefined && instanceId < this._points.length) {
        this.dispatchEvent(new CustomEvent('point-select', {
          detail: this._points[instanceId],
          bubbles: true,
          composed: true
        }));
      }
    } else {
      this.dispatchEvent(new CustomEvent('canvas-click', {
        bubbles: true,
        composed: true
      }));
    }
  }

  _updatePoints() {
    if (!this._scene || !this._THREE) return;

    const THREE = this._THREE;

    // Remove old mesh
    if (this._instancedMesh) {
      this._scene.remove(this._instancedMesh);
      this._instancedMesh.geometry.dispose();
      this._instancedMesh.material.dispose();
    }

    if (!this._points.length) return;

    // Create instanced mesh - instance colors multiply with material color
    // Set base color to WHITE so instance colors show correctly
    const geometry = new THREE.SphereGeometry(1, 12, 12);
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff  // White base - instance colors multiply with this
    });

    this._instancedMesh = new THREE.InstancedMesh(geometry, material, this._points.length);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // Brighter colors for better visibility against dark background
    const TYPE_COLORS = {
      episodic: '#60a5fa',   // blue
      semantic: '#4ade80',   // brighter green
      procedural: '#f472b6', // pink
      emotional: '#fbbf24',  // amber
      social: '#c4b5fd',     // brighter purple
      thought: '#67e8f9',    // cyan (more distinctive than slate)
      unknown: '#9ca3af'     // lighter gray
    };

    this._points.forEach((point, i) => {
      // Position (scaled for visibility)
      dummy.position.set(point.x * 5, point.y * 5, point.z * 5);

      // Scale by importance (larger base for visibility)
      const baseScale = 0.15 + (point.metadata?.importance || 0) * 0.15;
      const scale = point.id === this._selectedId ? baseScale * 2.0 : baseScale;
      dummy.scale.setScalar(scale);

      dummy.updateMatrix();
      this._instancedMesh.setMatrixAt(i, dummy.matrix);

      // Color by type
      const typeColor = TYPE_COLORS[point.metadata?.type] || TYPE_COLORS.unknown;
      color.set(typeColor);
      this._instancedMesh.setColorAt(i, color);
    });

    this._instancedMesh.instanceMatrix.needsUpdate = true;
    if (this._instancedMesh.instanceColor) {
      this._instancedMesh.instanceColor.needsUpdate = true;
    }

    this._scene.add(this._instancedMesh);
  }

  _animate() {
    this._animationId = requestAnimationFrame(() => this._animate());

    if (this._controls) {
      this._controls.update();
    }

    if (this._renderer && this._scene && this._camera) {
      this._renderer.render(this._scene, this._camera);
    }
  }

  // Called when attributes change
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'points' && newValue) {
      try {
        this._points = JSON.parse(newValue);
        this._updatePoints();
      } catch (e) {
        console.error('Failed to parse points:', e);
      }
    } else if (name === 'selected-id') {
      this._selectedId = newValue;
      this._updatePoints();
    }
  }

  // Expose setPoints method for direct updates (more efficient than attributes for large data)
  setPoints(points) {
    this._points = points || [];
    this._updatePoints();
  }

  setSelectedId(id) {
    this._selectedId = id;
    this._updatePoints();
  }
}

// Register the custom element if not already registered
if (!customElements.get('embedding-viz')) {
  customElements.define('embedding-viz', EmbeddingVizElement);
}
`;

export function EmbeddingVizCanvas({
  points,
  selectedId,
  onSelect,
  onCanvasClick,
}: EmbeddingVizCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  // Register the web component on mount
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    // Check if already registered
    if (!customElements.get('embedding-viz')) {
      // First, inject an import map so that 'three' bare specifier resolves to CDN
      // This is needed because OrbitControls imports 'three' as a bare module
      if (!document.querySelector('script[type="importmap"]')) {
        const importMap = document.createElement('script');
        importMap.type = 'importmap';
        importMap.textContent = JSON.stringify({
          imports: {
            three: 'https://unpkg.com/three@0.160.0/build/three.module.js',
            'three/addons/': 'https://unpkg.com/three@0.160.0/examples/jsm/',
          },
        });
        document.head.appendChild(importMap);
      }

      // Create and inject the script
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = WEB_COMPONENT_CODE;
      document.head.appendChild(script);
    }

    // Wait for custom element to be defined
    customElements.whenDefined('embedding-viz').then(() => {
      setIsReady(true);
    });

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Create the element once ready
  useEffect(() => {
    if (!isReady || !containerRef.current) return;

    // Create the custom element
    const element = document.createElement('embedding-viz') as any;
    element.style.width = '100%';
    element.style.height = '100%';

    // Clear container and append
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(element);
    elementRef.current = element;

    // Add event listeners
    const handlePointSelect = (e: CustomEvent) => {
      onSelect(e.detail);
    };
    const handleCanvasClick = () => {
      onCanvasClick();
    };

    element.addEventListener('point-select', handlePointSelect);
    element.addEventListener('canvas-click', handleCanvasClick);

    // Listen for Three.js ready event to re-send points if they were set before loading completed
    const handleThreeReady = () => {
      if (points.length > 0) {
        console.log(
          '[EmbeddingVizCanvas] Three.js ready, sending',
          points.length,
          'points'
        );
        element.setPoints(points);
      }
    };
    element.addEventListener('three-ready', handleThreeReady);

    return () => {
      element.removeEventListener('point-select', handlePointSelect);
      element.removeEventListener('canvas-click', handleCanvasClick);
      element.removeEventListener('three-ready', handleThreeReady);
    };
  }, [isReady, onSelect, onCanvasClick, points]);

  // Update points when they change
  useEffect(() => {
    if (
      elementRef.current &&
      typeof elementRef.current.setPoints === 'function'
    ) {
      elementRef.current.setPoints(points);
    }
  }, [points]);

  // Update selected ID when it changes
  useEffect(() => {
    if (
      elementRef.current &&
      typeof elementRef.current.setSelectedId === 'function'
    ) {
      elementRef.current.setSelectedId(selectedId);
    }
  }, [selectedId]);

  if (!isReady) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#666',
        }}
      >
        Initializing 3D engine...
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

export { TYPE_COLORS };
