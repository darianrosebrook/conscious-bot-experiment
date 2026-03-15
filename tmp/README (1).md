# Certification Arena v1

This package contains a bounded RCON-resettable arena and revised scenario manifests.

## Files

- `cert-arena.sh` — rebuilds the certification arena and prepares per-scenario fixtures
- `SCN-001-wood-acquisition.cert.ts`
- `SCN-002-crafting-chain.cert.ts`
- `SCN-003-stone-pickup.cert.ts`
- `SCN-004-stone-pickaxe.cert.ts`

## Recommended repo placement

- Copy `cert-arena.sh` to `scripts/cert-arena.sh`
- Copy the `SCN-*.cert.ts` files into `scenarios/manifests/`
- Keep your existing `types.ts` and `run-scenario.ts`; these manifests assume the same schema

## Arena layout

Center: `(1000,64,1000)`

- North pad: wood logs
- East pad: workstation placement zone
- South pad: exposed stone ring
- West pad: pickup probe zone

The arena is a 65x65 stone platform with a glass perimeter and all air above cleared. This prevents spillover into natural terrain and keeps certification scenarios bounded.

## Commands

Reset the empty arena:

```bash
./scripts/cert-arena.sh reset base
```

Prepare wood acquisition:

```bash
./scripts/cert-arena.sh reset scn-001
```

Prepare crafting chain:

```bash
./scripts/cert-arena.sh reset scn-002
```

Prepare stone mining + pickup:

```bash
./scripts/cert-arena.sh reset scn-003
```

Prepare full stone-pickaxe progression:

```bash
./scripts/cert-arena.sh reset scn-004
```

Spawn a dropped item on the west probe pad:

```bash
./scripts/cert-arena.sh probe pickup cobblestone 1
```

## Suggested validation ladder

1. `SCN-001` — wood acquisition
2. `SCN-002` — workstation + wooden pickaxe crafting
3. `SCN-003` — stone mining + cobblestone pickup only
4. `SCN-004` — full stone-pickaxe progression

`SCN-003` is intentionally narrower than the previous stone scenario. It isolates the mining/pickup chain before layering crafting back in.
