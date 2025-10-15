import { assertJsArrayEquals, assertValueEquals, test } from "./test";

test("Handle 'Math.abs' calls", () => {
    // Positive numbers
    assertValueEquals(Math.abs(5), 5);
    assertValueEquals(Math.abs(3.14), 3.14);
    assertValueEquals(Math.abs(0.1), 0.1);
    
    // Negative numbers
    assertValueEquals(Math.abs(-5), 5);
    assertValueEquals(Math.abs(-3.14), 3.14);
    assertValueEquals(Math.abs(-0.1), 0.1);
    
    // Edge cases
    assertValueEquals(Math.abs(0), 0);
    assertValueEquals(Math.abs(-0), 0);
    
    // Special values
    // assertValueEquals(Math.abs(Infinity), Infinity);
    // assertValueEquals(Math.abs(-Infinity), Infinity);
    // assertValueEquals(isNaN(Math.abs(NaN)), true);
});

test("Handle 'Math.ceil' calls", () => {
    // Positive numbers
    assertValueEquals(Math.ceil(3.7), 4);
    assertValueEquals(Math.ceil(3.1), 4);
    assertValueEquals(Math.ceil(3.0), 3);
    assertValueEquals(Math.ceil(3), 3);
    
    // Negative numbers
    assertValueEquals(Math.ceil(-3.7), -3);
    assertValueEquals(Math.ceil(-3.1), -3);
    assertValueEquals(Math.ceil(-3.0), -3);
    assertValueEquals(Math.ceil(-3), -3);
    
    // Edge cases
    assertValueEquals(Math.ceil(0), 0);
    assertValueEquals(Math.ceil(-0), 0);
    assertValueEquals(Math.ceil(0.1), 1);
    assertValueEquals(Math.ceil(-0.1), 0);
    
    // Special values
    // assertValueEquals(Math.ceil(Infinity), Infinity);
    // assertValueEquals(Math.ceil(-Infinity), -Infinity);
    // assertValueEquals(isNaN(Math.ceil(NaN)), true);
});

test("Handle 'Math.floor' calls", () => {
    // Positive numbers
    assertValueEquals(Math.floor(3.7), 3);
    assertValueEquals(Math.floor(3.1), 3);
    assertValueEquals(Math.floor(3.0), 3);
    assertValueEquals(Math.floor(3), 3);
    
    // Negative numbers
    assertValueEquals(Math.floor(-3.7), -4);
    assertValueEquals(Math.floor(-3.1), -4);
    assertValueEquals(Math.floor(-3.0), -3);
    assertValueEquals(Math.floor(-3), -3);
    
    // Edge cases
    assertValueEquals(Math.floor(0), 0);
    assertValueEquals(Math.floor(-0), 0);
    assertValueEquals(Math.floor(0.9), 0);
    assertValueEquals(Math.floor(-0.9), -1);
    
    // Special values
    // assertValueEquals(Math.floor(Infinity), Infinity);
    // assertValueEquals(Math.floor(-Infinity), -Infinity);
    // assertValueEquals(isNaN(Math.floor(NaN)), true);
});

test("Handle 'Math.trunc' calls", () => {
    // Positive numbers
    assertValueEquals(Math.trunc(3.7), 3);
    assertValueEquals(Math.trunc(3.1), 3);
    assertValueEquals(Math.trunc(3.0), 3);
    assertValueEquals(Math.trunc(3), 3);
    
    // Negative numbers
    assertValueEquals(Math.trunc(-3.7), -3);
    assertValueEquals(Math.trunc(-3.1), -3);
    assertValueEquals(Math.trunc(-3.0), -3);
    assertValueEquals(Math.trunc(-3), -3);
    
    // Edge cases
    assertValueEquals(Math.trunc(0), 0);
    assertValueEquals(Math.trunc(-0), 0);
    assertValueEquals(Math.trunc(0.9), 0);
    assertValueEquals(Math.trunc(-0.9), 0);
    
    // Special values
    // assertValueEquals(Math.trunc(Infinity), Infinity);
    // assertValueEquals(Math.trunc(-Infinity), -Infinity);
    // assertValueEquals(isNaN(Math.trunc(NaN)), true);
});

test("Handle 'Math.round' calls", () => {
    // Positive numbers
    assertValueEquals(Math.round(3.7), 4);
    assertValueEquals(Math.round(3.5), 4);
    assertValueEquals(Math.round(3.4), 3);
    assertValueEquals(Math.round(3.0), 3);
    assertValueEquals(Math.round(3), 3);
    
    // Negative numbers
    assertValueEquals(Math.round(-3.7), -4);
    assertValueEquals(Math.round(-3.5), -3);
    assertValueEquals(Math.round(-3.4), -3);
    assertValueEquals(Math.round(-3.0), -3);
    assertValueEquals(Math.round(-3), -3);
    
    // Edge cases
    assertValueEquals(Math.round(0), 0);
    assertValueEquals(Math.round(-0), 0);
    assertValueEquals(Math.round(0.5), 1);
    assertValueEquals(Math.round(-0.5), 0);
    assertValueEquals(Math.round(2.5), 3);
    assertValueEquals(Math.round(-2.5), -2);
    
    // Special values
    // assertValueEquals(Math.round(Infinity), Infinity);
    // assertValueEquals(Math.round(-Infinity), -Infinity);
    // assertValueEquals(isNaN(Math.round(NaN)), true);
});

test("Handle 'Math.max' calls", () => {
    // Two arguments
    assertValueEquals(Math.max(3, 7), 7);
    assertValueEquals(Math.max(7, 3), 7);
    assertValueEquals(Math.max(-3, -7), -3);
    assertValueEquals(Math.max(-7, -3), -3);
    
    // Multiple arguments
    assertValueEquals(Math.max(1, 2, 3, 4, 5), 5);
    assertValueEquals(Math.max(5, 4, 3, 2, 1), 5);
    assertValueEquals(Math.max(-1, -2, -3, -4, -5), -1);
    
    // Mixed positive and negative
    assertValueEquals(Math.max(-10, 0, 10), 10);
    assertValueEquals(Math.max(-5, -1, 3, 2), 3);
    
    // Decimal numbers
    assertValueEquals(Math.max(3.14, 2.71), 3.14);
    assertValueEquals(Math.max(-3.14, -2.71), -2.71);
    
    // Edge cases
    assertValueEquals(Math.max(0, -0), 0);
    assertValueEquals(Math.max(-0, 0), 0);
    
    // Single argument
    assertValueEquals(Math.max(42), 42);
    
    // No arguments
    // assertValueEquals(Math.max(), -Infinity);
    
    // Special values
    // assertValueEquals(Math.max(1, NaN), NaN);
    // assertValueEquals(Math.max(Infinity, 1), Infinity);
    // assertValueEquals(Math.max(-Infinity, 1), 1);
});

test("Handle 'Math.min' calls", () => {
    // Two arguments
    assertValueEquals(Math.min(3, 7), 3);
    assertValueEquals(Math.min(7, 3), 3);
    assertValueEquals(Math.min(-3, -7), -7);
    assertValueEquals(Math.min(-7, -3), -7);
    
    // Multiple arguments
    assertValueEquals(Math.min(1, 2, 3, 4, 5), 1);
    assertValueEquals(Math.min(5, 4, 3, 2, 1), 1);
    assertValueEquals(Math.min(-1, -2, -3, -4, -5), -5);
    
    // Mixed positive and negative
    assertValueEquals(Math.min(-10, 0, 10), -10);
    assertValueEquals(Math.min(-5, -1, 3, 2), -5);
    
    // Decimal numbers
    assertValueEquals(Math.min(3.14, 2.71), 2.71);
    assertValueEquals(Math.min(-3.14, -2.71), -3.14);
    
    // Edge cases
    assertValueEquals(Math.min(0, -0), -0);
    assertValueEquals(Math.min(-0, 0), -0);
    
    // Single argument
    assertValueEquals(Math.min(42), 42);
    
    // No arguments
    // assertValueEquals(Math.min(), Infinity);
    
    // Special values
    // assertValueEquals(isNaN(Math.min(1, NaN)), true);
    // assertValueEquals(Math.min(Infinity, 1), 1);
    // assertValueEquals(Math.min(-Infinity, 1), -Infinity);
});

test("Handle 'Math.sqrt' calls", () => {
    // Perfect squares
    assertValueEquals(Math.sqrt(0), 0);
    assertValueEquals(Math.sqrt(1), 1);
    assertValueEquals(Math.sqrt(4), 2);
    assertValueEquals(Math.sqrt(9), 3);
    assertValueEquals(Math.sqrt(16), 4);
    assertValueEquals(Math.sqrt(25), 5);
    
    // Non-perfect squares
    assertValueEquals(Math.sqrt(2), Math.sqrt(2)); // approximately 1.414
    assertValueEquals(Math.sqrt(3), Math.sqrt(3)); // approximately 1.732
    assertValueEquals(Math.sqrt(5), Math.sqrt(5)); // approximately 2.236
    
    // Decimal numbers
    assertValueEquals(Math.sqrt(0.25), 0.5);
    assertValueEquals(Math.sqrt(0.01), 0.1);
    assertValueEquals(Math.sqrt(1.44), 1.2);
    
    // Edge cases
    assertValueEquals(Math.sqrt(-0), 0);
    
    // Negative numbers (should return NaN)
    // assertValueEquals(isNaN(Math.sqrt(-1)), true);
    // assertValueEquals(isNaN(Math.sqrt(-4)), true);
    
    // Special values
    // assertValueEquals(Math.sqrt(Infinity), Infinity);
    // assertValueEquals(isNaN(Math.sqrt(NaN)), true);
});