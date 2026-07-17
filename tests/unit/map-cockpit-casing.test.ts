import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Text/regex parse of src/components/cockpit/map-cockpit.tsx -- NOT a normal
// import. The component needs a DOM + a live MapLibre GL instance to render
// (react-map-gl's <Map>/<Source>/<Layer> mount real WebGL context), so
// importing it in a plain vitest/node unit run would blow up. Reading it as
// text and asserting on the literal Layer/paint source is the only DOM-free
// way to pin the casing layer's id, JSX ordering, color, and width
// expression shape.
//
// Mirrors seed-demo-coordinates.test.ts's convention of regex-parsing source
// text instead of importing when the module under test has unrunnable-here
// side effects/dependencies.

const source = readFileSync(
  path.resolve(__dirname, "../../src/components/cockpit/map-cockpit.tsx"),
  "utf8",
);

describe("map-cockpit parcel outline casing", () => {
  it("defines a 'cockpit-parcels-casing' Layer of type 'line'", () => {
    // Must find a Layer block with id "cockpit-parcels-casing" and
    // type="line" (order of the id/type props may vary, so look for both
    // within a bounded window anchored on the id).
    const idIndex = source.indexOf('"cockpit-parcels-casing"');
    expect(idIndex).toBeGreaterThan(-1);
    const window = source.slice(idIndex, idIndex + 300);
    expect(window).toMatch(/type=["']line["']/);
  });

  it("renders the casing after the fill layer but before the colored line layer (JSX stacking order)", () => {
    const casingIndex = source.indexOf('"cockpit-parcels-casing"');
    const fillIndex = source.indexOf('"cockpit-parcels-fill"');
    const lineIndex = source.indexOf('"cockpit-parcels-line"');
    expect(casingIndex).toBeGreaterThan(-1);
    expect(fillIndex).toBeGreaterThan(-1);
    expect(lineIndex).toBeGreaterThan(-1);
    // MapLibre/react-map-gl stacks layers in JSX declaration order, so the
    // casing must sit strictly between the fill and the colored stroke to
    // render beneath the status-colored outline for every theme.
    expect(casingIndex).toBeGreaterThan(fillIndex);
    expect(casingIndex).toBeLessThan(lineIndex);
  });

  it("uses a theme-independent near-black ~60% opacity constant for the casing color, not a theme token", () => {
    // Must exist somewhere as a literal rgba(0, 0, 0, 0.6)-shaped constant.
    const rgbaMatch = source.match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.6\s*\)/);
    expect(rgbaMatch).not.toBeNull();

    // The casing layer's paint block must reference that literal (directly
    // or via a module-level constant it's assigned to) and must not read
    // from the theme-token machinery -- casing legibility must not vary
    // between light/dark themes.
    const casingIndex = source.indexOf('"cockpit-parcels-casing"');
    const lineIndex = source.indexOf('"cockpit-parcels-line"');
    const casingBlock = source.slice(casingIndex, lineIndex);

    expect(casingBlock).not.toMatch(/tokens\./);
    expect(casingBlock).not.toMatch(/readColorToken/);

    // The constant backing the casing's line-color must be reachable from
    // the casing paint block: either the literal itself appears in the
    // block, or a module-level identifier assigned to that literal is
    // referenced inside the block.
    const constAssignMatch = source.match(
      /const\s+(\w+)\s*=\s*["'`]rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.6\s*\)["'`]/,
    );
    const literalInBlock = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.6\s*\)/.test(
      casingBlock,
    );
    const identifierInBlock =
      constAssignMatch != null && casingBlock.includes(constAssignMatch[1]);
    expect(literalInBlock || identifierInBlock).toBe(true);
  });

  it("builds a casing width expression via idMatchExpr with widths offset +2 over the colored stroke (5.5/3.5 vs 3.5/1.5)", () => {
    // The existing colored-stroke width expression (lineWidthExpr) keys
    // selected/unselected widths of 3.5/1.5 off selectedParcelId via
    // idMatchExpr. The casing must track the same selection state but
    // offset both widths by +2 so the halo stays visibly wider than the
    // colored stroke in both selected and unselected states.
    const casingWidthDecl = source.match(
      /const\s+casingWidthExpr\s*=\s*useMemo\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/,
    );
    expect(casingWidthDecl).not.toBeNull();
    const block = casingWidthDecl![0];

    expect(block).toMatch(/idMatchExpr/);
    expect(block).toMatch(/selectedParcelId/);
    expect(block).toMatch(/5\.5/);
    expect(block).toMatch(/3\.5/);
  });

  it("references the casing width expression from the casing layer's paint block", () => {
    const casingIndex = source.indexOf('"cockpit-parcels-casing"');
    const lineIndex = source.indexOf('"cockpit-parcels-line"');
    const casingBlock = source.slice(casingIndex, lineIndex);
    expect(casingBlock).toMatch(/casingWidthExpr/);
  });
});
