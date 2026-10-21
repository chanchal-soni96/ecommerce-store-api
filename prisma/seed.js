
import prisma from "../src/lib/prisma.js";

async function main() {
  // 1. Create categories
  const electronics = await prisma.category.upsert({
    where: { name: "Electronics" },
    update: {},
    create: { name: "Electronics" },
  });

  const clothing = await prisma.category.upsert({
    where: { name: "Clothing" },
    update: {},
    create: { name: "Clothing" },
  });

  // 2. Define sample products
  const products = [
    {
      name: "Smartphone",
      sku: "PHONE-001",
      price: "15000.00",
      categoryId: electronics.id,
      quantity: 10,
    },
    {
      name: "Headphones",
      sku: "AUDIO-001",
      price: "2000.00",
      categoryId: electronics.id,
      quantity: 25,
    },
    {
      name: "T-Shirt",
      sku: "CLOTH-001",
      price: "500.00",
      categoryId: clothing.id,
      quantity: 30,
    },
  ];

  // 3. Create products and inventory
  for (const item of products) {
    await prisma.product.upsert({
      where: { sku: item.sku },
      update: {},
      create: {
        name: item.name,
        sku: item.sku,
        price: item.price,
        categoryId: item.categoryId,
        inventory: {
          create: { quantity: item.quantity },
        },
      },
    });
  }

  // 4. Create a test customer
  await prisma.user.upsert({
    where: { email: "customer@example.com" },
    update: {},
    create: {
      name: "Test Customer",
      email: "customer@example.com",
    },
  });

  console.log("Seed completed successfully!");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
