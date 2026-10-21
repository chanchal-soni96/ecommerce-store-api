// Checks the available stock of products.

import prisma from "../src/lib/prisma.js";

try {
  const products = await prisma.product.findMany({
    include: { inventory: true },
    orderBy: { id: "asc" },
  });

  console.table(
    products.map((product) => ({
      id: product.id,
      name: product.name,
      stock: product.inventory?.quantity ?? "No inventory",
    }))
  );
} catch (error) {
  console.error(error.message);
} finally {
  await prisma.$disconnect();
}
