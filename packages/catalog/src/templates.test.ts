import { DesignDocSchema, designWeight, findIssues } from "@vanbuild/core";
import { describe, expect, it } from "vitest";
import { designFromTemplate, getPartDefinition, shells, templates } from "./index";

describe("templates", () => {
  it("have unique ids and start with the empty van", () => {
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
    expect(templates[0]?.id).toBe("empty");
  });

  for (const template of templates) {
    for (const shell of shells) {
      describe(`${template.name} in a ${shell.name}`, () => {
        const doc = designFromTemplate(template, shell);

        it("is a valid design", () => {
          expect(DesignDocSchema.safeParse(doc).error).toBeUndefined();
          expect(Object.keys(doc.parts)).toHaveLength(template.parts.length);
        });

        it("has nothing overlapping or sticking out", () => {
          expect(findIssues(doc, shell, getPartDefinition)).toEqual([]);
        });

        it("is within every weight rating with two people aboard", () => {
          const weight = designWeight(doc, shell, getPartDefinition);
          for (const check of [weight.front, weight.rear, weight.gross]) {
            expect(check.status).not.toBe("over");
          }
        });
      });
    }
  }

  it("keeps the sliding door clear", () => {
    for (const template of templates) {
      for (const shell of shells) {
        const door = shell.openings.find((o) => o.kind === "slidingDoor");
        if (!door) continue;
        const doc = designFromTemplate(template, shell);
        const halfWidth = 600;
        for (const part of Object.values(doc.parts)) {
          const def = getPartDefinition(part.defId);
          if (def?.mount === "roof" || def?.mount === "wall") continue;
          const { x, y } = part.position;
          const blocking = x > door.from && x < door.to && y > halfWidth;
          expect(blocking, `${template.id} ${shell.id} ${part.id}`).toBe(false);
        }
      }
    }
  });
});
