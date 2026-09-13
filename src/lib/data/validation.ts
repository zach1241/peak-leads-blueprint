import { z } from "zod";
import {
  clientStatuses,
  priorities,
  projectStatuses,
  taskStatuses,
} from "./constants";
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const optionalId = z
  .union([z.uuid(), z.literal("")])
  .transform((v) => v || null);
const date = z.union([z.iso.date(), z.literal("")]).transform((v) => v || null);
export const taskSchema = z.object({
  title: z.string().trim().min(1, "A title is required.").max(240),
  description: optionalText(20000),
  status: z.enum(taskStatuses),
  priority: z.enum(priorities),
  due_date: date,
  project_id: optionalId,
  client_id: optionalId,
  assignees: z.array(z.uuid()).max(100),
});
export const clientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .max(100)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens.",
    ),
  status: z.enum(clientStatuses),
  primary_contact_name: optionalText(120),
  primary_contact_email: z
    .union([z.email().max(254), z.literal("")])
    .transform((v) => v || null),
  website: z
    .union([z.url({ protocol: /^https?$/ }).max(2048), z.literal("")])
    .transform((v) => v || null),
  notes: optionalText(10000),
});
export const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: optionalText(10000),
    status: z.enum(projectStatuses),
    client_id: optionalId,
    start_date: date,
    due_date: date,
  })
  .refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, {
    message: "Due date must be on or after the start date.",
    path: ["due_date"],
  });
export const commentSchema = z.object({
  task_id: z.uuid(),
  body: z.string().trim().min(1, "Write a comment first.").max(10000),
});
