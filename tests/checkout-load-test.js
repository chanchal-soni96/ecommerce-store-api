// Measures checkout API performance under multiple requests.

import autocannon from "autocannon";

const test = autocannon(
  {
    url: "http://127.0.0.1:3000",
    connections: 10,
    duration: 10,
    requests: [
      {
        method: "POST",
        path: "/api/orders/checkout",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: 1,
          items: [{ productId: 1, quantity: 1 }],
        }),
      },
    ],
  },
  (error, result) => {
    if (error) {
      console.error("Autocannon error:", error);
      return;
    }

    console.log("\n--- Checkout Load Test Results ---");
    console.log("Total requests:", result.requests.total);
    console.log("Status codes:", result.statusCodeStats);
    console.log("Errors:", result.errors);
    console.log("Timeouts:", result.timeouts);
    console.log("Non-2xx responses:", result.non2xx);
    console.log("Latency:", result.latency);
  }
);

autocannon.track(test, { renderProgressBar: true });