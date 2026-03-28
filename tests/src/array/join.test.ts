// Basic usage (default comma separator)
const arr1 = [1, 2, 3];
botest.assertValueEquals(arr1.join(), "1,2,3", "join() default should use comma separator");

// Custom separator
botest.assertValueEquals(arr1.join("-"), "1-2-3", "join('-') should use dash separator");
botest.assertValueEquals(arr1.join(" "), "1 2 3", "join(' ') should use space separator");
botest.assertValueEquals(arr1.join(""), "123", "join('') should concatenate without separator");
botest.assertValueEquals(arr1.join(" and "), "1 and 2 and 3", "join(' and ') should use custom separator");

// Empty separator
botest.assertValueEquals(arr1.join(""), "123", "join('') empty separator should concatenate");

// Array with strings
const arr2 = ["a", "b", "c"];
botest.assertValueEquals(arr2.join(), "a,b,c", "join() on string array default separator");
botest.assertValueEquals(arr2.join("-"), "a-b-c", "join('-') on string array");

// Array with mixed types
const arr3 = [1, "hello", true, null, undefined];
botest.assertValueEquals(arr3.join(), "1,hello,true,,undefined", "join() should convert mixed types to strings"); // в JS выводится '1,hello,true,,'

botest.assertOk();

export {};
