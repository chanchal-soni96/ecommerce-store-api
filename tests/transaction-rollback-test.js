// Checks that failed transactions roll back database changes.

import prisma from "../src/lib/prisma.js";

async function testTransactionRollback() {
  const userId = 1;
  const productId = 2; // Headphones: currently 25 in stock
  const quantity = 1;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { inventory: true },
    });

    if (!user || !product || !product.inventory) {
      throw new Error("Test user, product, or inventory is missing.");
    }

    if (product.inventory.quantity < quantity) {
      throw new Error("Insufficient stock. No changes made.");
    }

    const beforeStock = product.inventory.quantity;
    const beforeOrderCount = await prisma.order.count();

    console.log("Stock before:", beforeStock);
    console.log("Orders before:", beforeOrderCount);

    try {
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            userId,
            total: Number(product.price).toFixed(2),
            status: "PENDING",
            orderItems: {
              create: [{
                productId,
                quantity,
                unitPrice: Number(product.price).toFixed(2),
              }],
            },
          },
        });

        await tx.inventory.update({
          where: { productId },
          data: { quantity: { decrement: quantity } },
        });

        console.log("Temporary order created:", order.id);

        // Deliberately fail after both database writes.
        throw new Error("INTENTIONAL_ROLLBACK_TEST");
      });
    } catch (error) {
      if (error.message !== "INTENTIONAL_ROLLBACK_TEST") {
        throw error;
      }

      console.log("Expected transaction failure caught.");
    }

    const afterProduct = await prisma.product.findUnique({
      where: { id: productId },
      include: { inventory: true },
    });

    const afterOrderCount = await prisma.order.count();

    console.log("Stock after:", afterProduct.inventory.quantity);
    console.log("Orders after:", afterOrderCount);

    const passed =
      afterProduct.inventory.quantity === beforeStock &&
      afterOrderCount === beforeOrderCount;

    if (!passed) {
      throw new Error("FAIL: Database state changed unexpectedly.");
    }

    console.log("PASS: Order and inventory changes were rolled back.");
  } catch (error) {
    console.error("Rollback test failed:", error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

testTransactionRollback();
