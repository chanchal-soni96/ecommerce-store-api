
import { z } from "zod";

export const checkoutSchema = z.object({
  userId: z.number().int().positive("User ID must be a positive integer"),

  items: z
    .array(
      z.object({
        productId: z.number().int().positive(
          "Product ID must be a positive integer"
        ),
        quantity: z.number().int().positive(
          "Quantity must be a positive integer"
        ),
      })
    )
    .min(1, "At least one product is required"),
});
