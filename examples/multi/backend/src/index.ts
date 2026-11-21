/** Backend entry point for the multi-package linking example. */
function main(): void {
  const numbers = [1, 2, 3, 4, 5];
  let sum = 0;

  for (const number of numbers) {
    sum += number;
  }

  alert("Sum: " + sum);
}

main();
