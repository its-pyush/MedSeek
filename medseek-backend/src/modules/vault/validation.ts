import { z } from "zod";

export const recordTypeEnum = z.enum(["condition", "medication", "allergy", "report"]);

export const createRecordSchema = z.object({
  record_type: recordTypeEnum,
  data: z.record(z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    "Record data cannot be empty"
  ),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;

export const updateRecordSchema = z.object({
  data: z.record(z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    "Record data cannot be empty"
  ),
});

export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;

export const recordIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listRecordsSchema = z.object({
  type: recordTypeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
