// Test script to check mineflayer-pathfinder export structure
import pathfinder from 'mineflayer-pathfinder';

console.log('Pathfinder module:', pathfinder);
console.log('Keys:', Object.keys(pathfinder));
console.log('Goals:', pathfinder.goals);
if (pathfinder.goals) {
  console.log('Goals keys:', Object.keys(pathfinder.goals));
  console.log('GoalNear:', pathfinder.goals.GoalNear);
}
