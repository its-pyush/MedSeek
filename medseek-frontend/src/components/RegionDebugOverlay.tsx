"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import {
  REGION_HIERARCHY,
  RegionProxy,
  getMajorProxies,
  getSubRegionProxies,
  getVolumeCenter,
} from "./regionHierarchy";

export interface RegionDebugOverlayProps {
  enabled: boolean;
  filter: "current" | "all";
  isBackView: boolean;
  mode: "full" | "zoom";
  activeMajorId: string | null;
  selectedSubRegionId: string | null;
  hoveredGroupId: string | null;
}

/**
 * Dev-Only 3D Region Collision & Hit-Testing Visualizer.
 * Renders exact wireframe primitives (capsules, boxes, spheres) matching
 * actual anatomy dimensions, positions, and rotations for each region.
 * Completely excluded in production builds.
 */
export default function RegionDebugOverlay({
  enabled,
  filter,
  isBackView,
  mode,
  activeMajorId,
  selectedSubRegionId,
  hoveredGroupId,
}: RegionDebugOverlayProps) {
  const currentView = isBackView ? "back" : "front";

  // Derive visible proxies based on filter mode
  const proxiesToRender = useMemo(() => {
    if (!enabled || process.env.NODE_ENV === "production") {
      return [];
    }
    const list: Array<RegionProxy & { type: "major" | "sub" }> = [];

    if (filter === "all") {
      // Render every single major and sub-region proxy in the hierarchy
      for (const major of REGION_HIERARCHY) {
        const majorProxies = getMajorProxies(major);
        majorProxies.forEach((p) => list.push({ ...p, type: "major" }));

        if (major.subRegions) {
          for (const sub of major.subRegions) {
            const subProxies = getSubRegionProxies(sub, major.id);
            subProxies.forEach((p) => list.push({ ...p, type: "sub" }));
          }
        }
      }
      return list;
    }

    // "current" filter: match current interaction state and orientation
    if (mode === "full" || !activeMajorId) {
      // Majors matching current view (front vs back)
      const majors = REGION_HIERARCHY.filter((m) => m.view === currentView);
      for (const major of majors) {
        const majorProxies = getMajorProxies(major);
        majorProxies.forEach((p) => list.push({ ...p, type: "major" }));
      }
    } else {
      // Zoom mode: sub-regions of active major
      const activeMajor = REGION_HIERARCHY.find((m) => m.id === activeMajorId);
      if (activeMajor && activeMajor.subRegions) {
        for (const sub of activeMajor.subRegions) {
          const subProxies = getSubRegionProxies(sub, activeMajor.id);
          subProxies.forEach((p) => list.push({ ...p, type: "sub" }));
        }
      }
    }

    return list;
  }, [enabled, filter, currentView, mode, activeMajorId]);

  if (!enabled || process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <group name="RegionDebugOverlay">
      {proxiesToRender.map((proxy, proxyIdx) => {
        const isHovered = hoveredGroupId === proxy.groupId;
        const isSelected =
          selectedSubRegionId === proxy.groupId || activeMajorId === proxy.groupId;

        let wireColor = proxy.type === "major" ? "#06b6d4" : "#f59e0b";
        if (isHovered) wireColor = "#00f0ff";
        if (isSelected) wireColor = "#f43f5e";

        const wireOpacity = isHovered ? 0.95 : isSelected ? 0.85 : 0.45;

        // Shape summary string for badge
        const shapeSummary = proxy.volumes
          .map((v) => {
            if (v.type === "capsule") return "capsule";
            if (v.type === "box") return "box";
            return "sphere";
          })
          .join("+");

        return (
          <group key={`${proxy.groupId}-${proxy.pos[0]}-${proxyIdx}`}>
            {/* Render each primitive volume belonging to this region */}
            {proxy.volumes.map((vol, vIdx) => {
              const center = getVolumeCenter(vol);

              return (
                <group key={`vol-${vIdx}`}>
                  {/* Center Anchor Point */}
                  <mesh position={center}>
                    <sphereGeometry args={[0.02, 8, 8]} />
                    <meshBasicMaterial
                      color={isHovered || isSelected ? "#ffffff" : wireColor}
                      depthTest={false}
                    />
                  </mesh>

                  {/* Wireframe Primitive */}
                  {vol.type === "sphere" && (
                    <mesh position={vol.pos}>
                      <sphereGeometry args={[vol.radius, 14, 10]} />
                      <meshBasicMaterial
                        wireframe
                        color={wireColor}
                        transparent
                        opacity={wireOpacity}
                        depthTest={false}
                      />
                    </mesh>
                  )}

                  {vol.type === "capsule" && (() => {
                    const start = new THREE.Vector3(...vol.start);
                    const end = new THREE.Vector3(...vol.end);
                    const dir = end.clone().sub(start);
                    const len = dir.length();
                    const c = start.clone().add(end).multiplyScalar(0.5);
                    const quat = new THREE.Quaternion();
                    if (len >= 1e-4) {
                      quat.setFromUnitVectors(
                        new THREE.Vector3(0, 1, 0),
                        dir.clone().normalize()
                      );
                    }
                    return (
                      <mesh position={c} quaternion={quat}>
                        <capsuleGeometry args={[vol.radius, Math.max(len, 0.01), 8, 14]} />
                        <meshBasicMaterial
                          wireframe
                          color={wireColor}
                          transparent
                          opacity={wireOpacity}
                          depthTest={false}
                        />
                      </mesh>
                    );
                  })()}

                  {vol.type === "box" && (() => {
                    const [hx, hy, hz] = vol.halfExtents;
                    const rot = vol.rotation || [0, 0, 0];
                    return (
                      <mesh position={vol.pos} rotation={rot}>
                        <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
                        <meshBasicMaterial
                          wireframe
                          color={wireColor}
                          transparent
                          opacity={wireOpacity}
                          depthTest={false}
                        />
                      </mesh>
                    );
                  })()}
                </group>
              );
            })}

            {/* In-Scene 3D Metadata Badge */}
            <Html
              center
              distanceFactor={9}
              position={[proxy.pos[0], proxy.pos[1] + proxy.radius * 0.4, proxy.pos[2]]}
              style={{
                pointerEvents: "none",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              <div
                style={{
                  backgroundColor: isHovered
                    ? "rgba(14, 165, 233, 0.95)"
                    : isSelected
                    ? "rgba(225, 29, 72, 0.95)"
                    : proxy.type === "major"
                    ? "rgba(15, 23, 42, 0.85)"
                    : "rgba(30, 41, 59, 0.85)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontFamily: "monospace",
                  padding: "2px 6px",
                  borderRadius: "6px",
                  border: `1px solid ${wireColor}`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  lineHeight: "1.2",
                }}
              >
                <span style={{ fontWeight: "bold" }}>{proxy.groupId}</span>
                <span style={{ opacity: 0.8, fontSize: "9px" }}>
                  {shapeSummary} | y:{proxy.pos[1].toFixed(2)}
                </span>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
