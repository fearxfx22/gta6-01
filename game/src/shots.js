// Screenshot scenes behind ?shot=title|street. Each one plays the real game
// forward from a fresh state for a fixed number of steps, so the frame is what
// a short session really looks like and the same seed always gives the same
// frame. (Chase and mission shots land with police + missions in phase 5.)
export function stageShot(name, G) {
  const { rig, world, player, traffic, pedestrians } = G;
  if (name === 'street') {
    // On foot on a busy avenue: player mid-stride, traffic rolling, locals about.
    player.reset(-30, 128);
    const fakeInput = { axis: () => ({ x: 0, z: -1 }), down: () => false };
    player.update(0.5, fakeInput, Math.PI * 0.9);
    rig.setYaw(Math.PI * 0.9 + Math.PI);
    for (let i = 0; i < 120; i += 1) {
      traffic.update(1 / 60, player.pos);
      pedestrians.update(1 / 60, { playerX: player.pos.x, playerZ: player.pos.z, carSpeed: 0, gunshot: null });
      world.update(1 / 60);
    }
    for (let i = 0; i < 30; i += 1) {
      rig.follow(1 / 60, { x: player.pos.x, y: 0, z: player.pos.z }, player.heading, 'foot', world.colliders);
    }
    return { screen: 'play' };
  }
  // Default: title orbit over the city at golden hour.
  for (let i = 0; i < 120; i += 1) world.update(1 / 60);
  rig.setTitleView(14);
  return { screen: 'title' };
}
