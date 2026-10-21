// Tests simultaneous checkouts to ensure stock is not oversold.

import prisma from "../src/lib/prisma.js";

const BASE_URL = "http://127.0.0.1:3000";
const USER_ID = 1;
const PRODUCT_ID = 2; // Headphones
const TEST_STOCK = 5;
const REQUEST_COUNT = 10;

async function runConcurrencyTest() {
  let originalStock;
  let stockWasChanged = false;
  const createdOrderIds = [];

  try {
    const inventory = await prisma.inventory.findUnique({
      where: { productId: PRODUCT_ID },
    });

    const user = await prisma.user.findUnique({
      where: { id: USER_ID },
    });

    if (!inventory || !user) {
      throw new Error("Test user or inventory record not found.");
    }

    originalStock = inventory.quantity;

    console.log("Original stock:", originalStock);
    console.log("Temporary test stock:", TEST_STOCK);
    console.log("Concurrent requests:", REQUEST_COUNT);

    // Set limited stock for this isolated test.
    await prisma.inventory.update({
      where: { productId: PRODUCT_ID },
      data: { quantity: TEST_STOCK },
    });
    stockWasChanged = true;

    const responses = await Promise.all(
      Array.from({ length: REQUEST_COUNT }, async () => {
        const response = await fetch(
          `${BASE_URL}/api/orders/checkout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: USER_ID,
              items: [
                { productId: PRODUCT_ID, quantity: 1 },
              ],
            }),
          }
        );

        const body = await response.json();

        if (response.status === 201 && body.data?.id) {
          createdOrderIds.push(body.data.id);
        }

        return {
          status: response.status,
          body,
        };
      })
    );

    const successes = responses.filter(
      (response) => response.status === 201
    ).length;

    const conflicts = responses.filter(
      (response) => response.status === 409
    ).length;

    const unexpected = responses.filter(
      (response) =>
        response.status !== 201 && response.status !== 409
    );

    const currentInventory = await prisma.inventory.findUnique({
      where: { productId: PRODUCT_ID },
    });

    console.log("\n--- Concurrency Test Results ---");
    console.log("Successful checkouts:", successes);
    console.log("Conflict responses (409):", conflicts);
    console.log("Unexpected responses:", unexpected.length);
    console.log("Stock while testing:", currentInventory.quantity);
    console.log("Test order IDs:", createdOrderIds);

    if (
      successes === TEST_STOCK &&
      conflicts === REQUEST_COUNT - TEST_STOCK &&
      currentInventory.quantity === 0 &&
      unexpected.length === 0
    ) {
      console.log(
        "PASS: Concurrent checkouts did not oversell inventory."
      );
    } else {
      console.error(
        "FAIL: Results differ from the expected concurrency behavior."
      );

      for (const result of unexpected) {
        console.error(result.status, result.body);
      }

      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Concurrency test failed:", error.message);
    process.exitCode = 1;
  } finally {
    try {
      // Remove only orders created by this test.
      if (createdOrderIds.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.orderItem.deleteMany({
            where: { orderId: { in: createdOrderIds } },
          });

          await tx.order.deleteMany({
            where: { id: { in: createdOrderIds } },
          });
        });
      }
    } catch (cleanupError) {
      console.error(
        "WARNING: Test-order cleanup failed:",
        cleanupError.message
      );
      console.error("Test order IDs:", createdOrderIds);
      process.exitCode = 1;
    }

    try {
      if (stockWasChanged) {
        await prisma.inventory.update({
          where: { productId: PRODUCT_ID },
          data: { quantity: originalStock },
        });

        console.log("Original inventory stock restored:", originalStock);
      }
    } catch (restoreError) {
      console.error(
        "CRITICAL: Could not restore inventory:",
        restoreError.message
      );
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  }
}

runConcurrencyTest();
