
import { Router } from "express";
import prisma from "../lib/prisma.js";
import {
  createProductSchema,
  updateProductSchema,
} from "../validators/productSchema.js";

const router = Router();

const productInclude = {
  category: true,
  inventory: true,
};

// GET /api/products
// List products with filtering, sorting, and pagination
router.get("/", async (req, res, next) => {
  try {
    const {
      categoryId,
      minPrice,
      maxPrice,
      sortBy = "createdAt",
      order = "desc",
      page = "1",
      limit = "10",
    } = req.query;

    const allowedSortFields = ["id", "name", "price", "createdAt"];

    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sortBy field",
        allowedFields: allowedSortFields,
      });
    }

    if (!["asc", "desc"].includes(order)) {
      return res.status(400).json({
        success: false,
        message: "order must be asc or desc",
      });
    }

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(limitNumber) ||
      limitNumber < 1 ||
      limitNumber > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "page must be positive and limit must be between 1 and 100",
      });
    }

    const where = {};

    if (categoryId !== undefined) {
      const parsedCategoryId = Number(categoryId);

      if (
        !Number.isInteger(parsedCategoryId) ||
        parsedCategoryId < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "categoryId must be a positive integer",
        });
      }

      where.categoryId = parsedCategoryId;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter = {};

      if (minPrice !== undefined) {
        const value = Number(minPrice);

        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({
            success: false,
            message: "minPrice must be a non-negative number",
          });
        }

        priceFilter.gte = value;
      }

      if (maxPrice !== undefined) {
        const value = Number(maxPrice);

        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({
            success: false,
            message: "maxPrice must be a non-negative number",
          });
        }

        priceFilter.lte = value;
      }

      if (
        priceFilter.gte !== undefined &&
        priceFilter.lte !== undefined &&
        priceFilter.gte > priceFilter.lte
      ) {
        return res.status(400).json({
          success: false,
          message: "minPrice cannot be greater than maxPrice",
        });
      }

      where.price = priceFilter;
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [products, totalProducts] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: {
          [sortBy]: order,
        },
        skip,
        take: limitNumber,
      }),
      prisma.product.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: products,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        totalProducts,
        totalPages: Math.ceil(totalProducts / limitNumber),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id
// Fetch one product
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Product ID must be a positive integer",
      });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/products
// Create a product and its inventory record
router.post("/", async (req, res, next) => {
  try {
    const validation = createProductSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.error.issues,
      });
    }

    const product = await prisma.product.create({
      data: {
        ...validation.data,
        inventory: {
          create: {
            quantity: 0,
          },
        },
      },
      include: productInclude,
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A product with this SKU already exists",
      });
    }

    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "The specified category does not exist",
      });
    }

    next(error);
  }
});

// PATCH /api/products/:id
// Update selected product fields
router.patch("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Product ID must be a positive integer",
      });
    }

    const validation = updateProductSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.error.issues,
      });
    }

    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const product = await prisma.product.update({
      where: { id },
      data: validation.data,
      include: productInclude,
    });

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A product with this SKU already exists",
      });
    }

    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "The specified category does not exist",
      });
    }

    next(error);
  }
});

// DELETE /api/products/:id
// Delete a product and its inventory record
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Product ID must be a positive integer",
      });
    }

    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventory.deleteMany({
        where: { productId: id },
      });

      await tx.product.delete({
        where: { id },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    if (error.code === "P2003") {
      return res.status(409).json({
        success: false,
        message: "Cannot delete this product because it is referenced by an order",
      });
    }

    next(error);
  }
});

export default router;
