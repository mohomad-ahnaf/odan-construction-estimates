import { z } from "zod";

const positive = z.number().finite().positive().max(10000);
const coordinate = z.number().finite().min(-10000).max(10000);
const id = z.string().uuid();
const name = z.string().trim().min(1).max(100);
const face = z.object({
  side: z.enum(["A", "B"]), roomName: z.string().trim().max(100).nullable(),
  plaster: z.boolean(), plasterHeightMeters: z.number().finite().nonnegative().nullable(),
  paint: z.boolean(), paintHeightMeters: z.number().finite().nonnegative().nullable(),
}).strict();
const opening = z.object({
  id, label: name, type: z.enum(["DOOR", "WINDOW"]),
  positionMeters: z.number().finite().nonnegative(), widthMeters: positive,
  heightMeters: positive, sillMeters: z.number().finite().nonnegative(),
}).strict();
export const designerWallSchema = z.object({
  id, label: name, startX: coordinate, startY: coordinate, endX: coordinate, endY: coordinate,
  heightMeters: positive, thicknessMeters: positive,
  alignment: z.enum(["CENTRELINE", "INSIDE", "OUTSIDE"]),
  faces: z.tuple([face, face]), openings: z.array(opening).max(100),
}).strict();
const junction = z.object({ id, continuousWallId: id, adjoiningWallId: id,
  adjoiningEnd: z.enum(["START", "END"]) }).strict();
export const designerGeometrySchema = z.object({ walls: z.array(designerWallSchema).max(1000),
  junctions: z.array(junction).max(2000) }).strict();
export const createDesignerSchema = z.object({ name: name.default("Ground floor"),
  floorHeightMeters: positive.default(3) }).strict();
export const saveDesignerSchema = designerGeometrySchema.extend({
  version: z.number().int().positive(), name, floorHeightMeters: positive,
}).strict();
export const reviewDesignerSchema = z.object({ version: z.number().int().positive() }).strict();
export type SaveDesignerInput = z.infer<typeof saveDesignerSchema>;
export type DesignerGeometry = z.infer<typeof designerGeometrySchema>;
