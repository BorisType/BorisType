const arr = [1, 2, 3, 4, 1_0];
const callableArray: any[] = [];
const someCaptured = "captured";

for (var item1 of arr) {
  callableArray.push(() => {
    alert(someCaptured);
    alert(item1);
  });
}

for (const item2 of arr) {
  callableArray.push(() => {
    alert(someCaptured);
    alert(item2);
  });
}

export {};
