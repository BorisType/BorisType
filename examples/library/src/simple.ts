const arr = [1, 2, 3, 4, 5];
const callableArray: any[] = [];

for (var item1 of arr) {
  callableArray.push(() => {
    alert(item1);
  });
}

for (const item2 of arr) {
  callableArray.push(() => {
    alert(item2);
  });
}

export {};
