import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  sku: z.string().trim().min(1, "SKU is required"),
  description: z.string().optional(),
  price: z.number().positive("Price must be greater than zero"),
  categoryId: z.number().int().positive("Category ID must be a positive integer"),
});

export const updateProductSchema = createProductSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    "Provide at least one field to update"
  );