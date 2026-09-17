"use client";

import React, { useRef, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/* ─── Data Mapping ────────────────────────────────────────────── */

const BODY_REGIONS: Record<string, { position: [number, number, number], name: string }> = {
  head: { position: [0, 4.8, 0.3], name: "Head" },
  eye: { position: [0.15, 5.0, 0.6], name: "Eyes" },
  neck: { position: [0, 4.3, 0.2], name: "Neck" },
  throat: { position: [0, 4.3, 0.4], name: "Throat" },
  chest: { position: [0, 3.5, 0.6], name: "Chest" },
  abdomen: { position: [0, 2.5, 0.6], name: "Abdomen" },
  pelvis: { position: [0, 1.8, 0.4], name: "Pelvis" },
  arm: { position: [1.2, 3.0, 0], name: "Arm" },
  forearm: { position: [1.5, 2.0, 0], name: "Forearm" },
  wrist: { position: [1.6, 1.4, 0.1], name: "Wrist" },
  fingers: { position: [1.7, 1.0, 0.1], name: "Fingers" },
  thigh: { position: [0.5, 0.8, 0.3], name: "Thigh" },
  knee: { position: [0.5, -0.4, 0.4], name: "Knee" },
  calves: { position: [0.5, -1.2, 0.2], name: "Calves" },
  ankle: { position: [0.5, -2.0, 0.2], name: "Ankle" },
  foot: { position: [0.5, -2.4, 0.4], name: "Foot" },
  back: { position: [0, 3.2, -0.4], name: "Back" },
};

// Generic mapping, will map parts to symptom keywords
const SYMPTOM_MAP: Record<string, string[]> = {
  head: ['head'],
  migraine: ['head'],
  fever: ['head', 'chest'],
  cough: ['throat', 'chest'],
  sore: ['throat'],
  throat: ['throat'],
  neck: ['neck'],
  chest: ['chest'],
  heart: ['chest'],
  breath: ['chest'],
  abdominal: ['abdomen'],
  stomach: ['abdomen'],
  nausea: ['abdomen'],
  bowel: ['abdomen'],
  back: ['back'],
  joint: ['knee', 'wrist', 'ankle'],
  knee: ['knee'],
  shoulder: ['arm'],
  arm: ['arm'],
  forearm: ['forearm'],
  wrist: ['wrist'],
  finger: ['fingers'],
  hand: ['fingers', 'wrist'],
  leg: ['thigh', 'calves'],
  thigh: ['thigh'],
  calf: ['calves'],
  calves: ['calves'],
  ankle: ['ankle'],
  foot: ['foot'],
  feet: ['foot'],
  eye: ['eye'],
  vision: ['eye'],
  fatigue: ['head'],
};

function getActiveRegions(symptoms: string[]): string[] {
  const regions = new Set<string>();
  symptoms.forEach(s => {
    const lowerS = s.toLowerCase();
    let matched = false;
    for (const [key, mappedRegions] of Object.entries(SYMPTOM_MAP)) {
      if (lowerS.includes(key)) {
        mappedRegions.forEach(r => regions.add(r));
        matched = true;
      }
    }
    // If no match, maybe try to match the region name directly
    if (!matched) {
      for (const key of Object.keys(BODY_REGIONS)) {
        if (lowerS.includes(key)) {
          regions.add(key);
        }
      }
    }
  });
  return Array.from(regions);
}

/* ─── Camera Controller ────────────────────────────────────────── */

function CameraController({ activeRegions }: { activeRegions: string[] }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 0.3, 4.5));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(() => {
    // Determine target based on active regions
    if (activeRegions.length === 1) {
      const region = BODY_REGIONS[activeRegions[0]];
      if (region) {
        // Body is at [1.3, -2.4, 0]
        // We want to move camera to look at the region, and zoom in a bit
        const worldY = -2.4 + (region.position[1] * 0.9);
        const worldX = 1.3 + (region.position[0] * 0.9);
        
        targetPos.current.set(worldX * 0.5, worldY, 3.0); 
        targetLookAt.current.set(worldX, worldY, 0);
      }
    } else if (activeRegions.length > 1) {
      // Zoom out slightly and center vertically on average Y
      let avgY = 0;
      let avgX = 0;
      activeRegions.forEach(r => {
        if (BODY_REGIONS[r]) {
          avgY += -2.4 + (BODY_REGIONS[r].position[1] * 0.9);
          avgX += 1.3 + (BODY_REGIONS[r].position[0] * 0.9);
        }
      });
      avgY /= activeRegions.length;
      avgX /= activeRegions.length;
      
      targetPos.current.set(avgX * 0.3, avgY, 4.0);
      targetLookAt.current.set(avgX, avgY, 0);
    } else {
      // Default
      targetPos.current.set(0, 0.3, 4.5);
      targetLookAt.current.set(0, 0, 0);
    }

    // Lerp camera position
    camera.position.lerp(targetPos.current, 0.05);
    
    // Lerp lookAt
    currentLookAt.current.lerp(targetLookAt.current, 0.05);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}

/* ─── Rotating Model ─────────────────────────────────────────── */

function RotatingBody({ activeRegions }: { activeRegions: string[] }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene } = useGLTF("/human_body.glb");

  React.useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !child.userData.isWireframe) {
        const mesh = child as THREE.Mesh;
        
        // Solid base to occlude back-faces without hiding the background gradient
        mesh.material = new THREE.MeshBasicMaterial({
          colorWrite: false, // Makes the solid mesh transparent to color but still writes to depth buffer!
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });

        // Prevent adding multiple wireframes on hot-reload
        const oldWire = mesh.children.find((c) => c.userData.isWireframe);
        if (oldWire) mesh.remove(oldWire);

        // Wireframe overlay with custom shader for highlighting
        const wireMat = new THREE.MeshBasicMaterial({
          color: 0x0284c7, // Medical blue
          wireframe: true,
          transparent: true,
          opacity: 0.8,
          depthTest: true,
        });
        
        wireMat.onBeforeCompile = (shader) => {
          shader.uniforms.uActivePoints = { value: Array(10).fill(new THREE.Vector3()) };
          shader.uniforms.uNumActivePoints = { value: 0 };
          wireMat.userData.shader = shader;
          
          shader.vertexShader = `
            varying vec3 vLocalPosition;
            ${shader.vertexShader}
          `.replace(
            `#include <project_vertex>`,
            `
            vLocalPosition = position;
            #include <project_vertex>
            `
          );
          
          shader.fragmentShader = `
            uniform vec3 uActivePoints[10];
            uniform int uNumActivePoints;
            varying vec3 vLocalPosition;
            ${shader.fragmentShader}
          `.replace(
            `vec4 diffuseColor = vec4( diffuse, opacity );`,
            `
            vec3 baseColor = diffuse;
            float glow = 0.0;
            for(int i = 0; i < 10; i++) {
              if (i >= uNumActivePoints) break;
              float dist = distance(vLocalPosition, uActivePoints[i]);
              float intensity = smoothstep(1.0, 0.1, dist); // Adjust glow radius
              glow += intensity;
            }
            glow = clamp(glow, 0.0, 1.0);
            
            // Neon red highlight
            vec3 highlightColor = vec3(1.0, 0.15, 0.25); 
            vec3 finalColor = mix(baseColor, highlightColor, glow);
            
            // Boost opacity where glowing
            float finalOpacity = mix(opacity, 1.0, glow); 
            
            vec4 diffuseColor = vec4( finalColor, finalOpacity );
            `
          );
        };

        const wireMesh = new THREE.Mesh(mesh.geometry, wireMat);
        wireMesh.userData.isWireframe = true;
        mesh.add(wireMesh);
      }
    });
  }, [scene]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      // Slow down rotation if inspecting a symptom
      const speed = activeRegions.length > 0 ? 0.02 : 0.15;
      groupRef.current.rotation.y += delta * speed;
    }

    // Update shader uniforms
    scene.traverse((child) => {
      if (child.userData.isWireframe) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (mat.userData && mat.userData.shader) {
          const shader = mat.userData.shader;
          shader.uniforms.uNumActivePoints.value = activeRegions.length;
          for (let i = 0; i < 10; i++) {
            if (i < activeRegions.length) {
              const region = BODY_REGIONS[activeRegions[i]];
              if (region) {
                shader.uniforms.uActivePoints.value[i].set(...region.position);
              }
            } else {
              shader.uniforms.uActivePoints.value[i].set(0, 0, 0);
            }
          }
        }
      }
    });
  });

  return (
    <group ref={groupRef} dispose={null} position={[1.3, -2.4, 0]}>
      <primitive object={scene} scale={0.9} />
    </group>
  );
}

/* ─── Main Component ──────────────────────────────────────────── */

interface HumanBodyModelProps {
  activeSymptoms?: string[];
}

export default function HumanBodyModel({ activeSymptoms = [] }: HumanBodyModelProps) {
  const activeRegions = useMemo(() => getActiveRegions(activeSymptoms), [activeSymptoms]);

  return (
    <div
      className="human-body-canvas-wrapper"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: activeRegions.length > 0 ? 0.9 : 0.6,
        transition: "opacity 0.5s ease"
      }}
    >
      <Canvas
        camera={{ position: [0, 0.3, 4.5], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        frameloop="always"
      >
        <ambientLight intensity={0.5} color="#f8fafc" />
        <directionalLight position={[5, 8, 5]} intensity={1.5} color="#0284c7" />
        <directionalLight position={[-3, 4, -5]} intensity={0.6} color="#0ea5e9" />
        <pointLight position={[0, 3, 3]} intensity={1} color="#0284c7" />
        <pointLight position={[-2, -1, 2]} intensity={0.4} color="#0ea5e9" />

        <Suspense fallback={null}>
          <CameraController activeRegions={activeRegions} />
          <RotatingBody activeRegions={activeRegions} />
        </Suspense>
      </Canvas>
    </div>
  );
}
