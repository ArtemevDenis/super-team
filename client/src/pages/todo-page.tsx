import { Panel } from '../shared/ui/primitives';
import { MyCommitments } from '../shared/ui/my-commitments';
import { TodoList } from '../shared/ui/todo-list';

export function TodoPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel title="Дела">
        <TodoList />
      </Panel>
      <Panel title="Я обещал">
        <MyCommitments />
      </Panel>
    </div>
  );
}
