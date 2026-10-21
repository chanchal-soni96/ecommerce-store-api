
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { checkoutSchema } from "../validators/orderSchema.js";

const router = Router();

// POST /api/orders/checkout
router.post("/checkout", async (req, res, next) => {
  try {
    // 1. Validate request body
    const validation = checkoutSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid checkout data",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const { userId, items } = validation.data;

    // 2. Prevent duplicate product IDs in the same order
    const productIds = items.map((item) => item.productId);
    const uniqueProductIds = new Set(productIds);

    if (uniqueProductIds.size !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: "Each product can appear only once in the order",
      });
    }

    // 3. Execute checkout inside a database transaction
    const order = await prisma.$transaction(async (tx) => {
      // Check whether the user exists
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      // Lock inventory rows before checking stock.
// Acquire locks in a consistent order to reduce deadlock risk.
const sortedProductIds = [...productIds].sort((a, b) => a - b);

for (const productId of sortedProductIds) {
  const lockedRows = await tx.$queryRaw`
    SELECT id
    FROM inventory
    WHERE "productId" = ${productId}
    FOR UPDATE
  `;

  if (lockedRows.length === 0) {
    const error = new Error(
      `Inventory not found for product ID ${productId}`
    );
    error.statusCode = 409;
    throw error;
  }
}

      let total = 0;
      const orderItems = [];

      // 4. Validate products and available inventory
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          include: {
            inventory: true,
          },
        });

        if (!product) {
          const error = new Error(
            `Product with ID ${item.productId} not found`
          );
          error.statusCode = 404;
          throw error;
        }

        if (!product.inventory) {
          const error = new Error(
            `Inventory not found for product ID ${item.productId}`
          );
          error.statusCode = 409;
          throw error;
        }

        if (product.inventory.quantity < item.quantity) {
          const error = new Error(
            `Insufficient stock for product: ${product.name}`
          );
          error.statusCode = 409;
          throw error;
        }

        // Use the database price, not a price sent by the client
        const unitPrice = Number(product.price);

        total += unitPrice * item.quantity;

        orderItems.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: unitPrice.toFixed(2),
        });
      }

      // 5. Create the order and its items
      const createdOrder = await tx.order.create({
        data: {
          userId,
          total: total.toFixed(2),
          status: "PENDING",
          orderItems: {
            create: orderItems,
          },
        },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // 6. Reduce inventory inside the same transaction
      for (const item of items) {
        await tx.inventory.update({
          where: {
            productId: item.productId,
          },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        });
      }

      return createdOrder;
    });

    // 7. Send successful response
    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: order,
    });
  } catch (error) {
    // Handle known database constraint errors
    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Invalid user or product reference",
      });
    }

    // Pass other errors to the central error handler
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
});



 // GET /api/orders
 // Retrieve all orders with customer and item details
router.get("/", async (req, res, next) => {
  try {
    const page = req.query.page === undefined
  ? 1
  : Number(req.query.page);

const limit = req.query.limit === undefined
  ? 10
  : Number(req.query.limit);

    const { status, sortOrder = "desc" } = req.query;

    if (
  !Number.isInteger(page) ||
  !Number.isInteger(limit) ||
  page < 1 ||
  limit < 1 ||
  limit > 100 ||
  !["asc", "desc"].includes(sortOrder)
) {
  return res.status(400).json({
    success: false,
    message: "Invalid pagination or sorting parameters",
  });
}

    const validStatuses = ["PENDING", "CONFIRMED", "CANCELLED"];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
        allowedStatuses: validStatuses,
      });
    }

    const where = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [orders, totalOrders] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          orderItems: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          createdAt: sortOrder,
        },
      }),
      prisma.order.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
      },
      filters: {
        status: status || "ALL",
        sortOrder,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
