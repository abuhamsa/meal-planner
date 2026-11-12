import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "../components/Toaster";
import { Avatar, Button, Input, Spinner } from "../components/ui";
import { ApiError, type Person } from "../lib/api";
import { useDeletePerson, useMe, usePeople, useSavePerson } from "../lib/queries";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#06b6d4", "#8b5cf6", "#84cc16", "#f97316", "#64748b"];

export function PeopleView() {
  const { data: people = [], isLoading } = usePeople();
  const { data: me } = useMe();
  const save = useSavePerson();
  const [newName, setNewName] = useState("");

  const add = (e: FormEvent) => {
    e.preventDefault();
    const used = new Set(people.map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[people.length % COLORS.length];
    save.mutate({ name: newName, color }, { onSuccess: () => setNewName("") });
  };

  const move = (index: number, dir: -1 | 1) => {
    const a = people[index];
    const b = people[index + dir];
    if (!a || !b) return;
    // Swap positions; fall back to the list index when positions are equal.
    const pa = a.position === b.position ? index : a.position;
    const pb = a.position === b.position ? index + dir : b.position;
    save.mutate({ id: a.id, position: pb });
    save.mutate({ id: b.id, position: pa });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-stone-400">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="text-lg font-semibold">People</h2>
      <p className="mt-1 text-sm text-stone-500">
        Everyone who eats along. Each person gets their own place in every lunch and dinner, so you can plan different meals when needed.
      </p>

      <ul className="mt-5 flex flex-col gap-2">
        {people.map((p, i) => (
          <PersonRow
            key={p.id}
            person={p}
            canDelete={people.length > 1}
            canMoveUp={i > 0}
            canMoveDown={i < people.length - 1}
            onMove={(dir) => move(i, dir)}
          />
        ))}
      </ul>

      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={50} placeholder="Add a person…" />
        <Button type="submit" variant="primary" disabled={!newName.trim() || save.isPending}>
          <Plus className="size-4" /> Add
        </Button>
      </form>

      {me && (
        <p className="mt-10 text-center text-xs text-stone-400">
          Signed in as {me.user.name} via Authentik · v{me.version}
        </p>
      )}
    </div>
  );
}

function PersonRow({
  person,
  canDelete,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  person: Person;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const [name, setName] = useState(person.name);
  const [showColors, setShowColors] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);
  const save = useSavePerson();
  const del = useDeletePerson();

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) return setName(person.name);
    if (trimmed !== person.name) save.mutate({ id: person.id, name: trimmed }, { onSuccess: () => toast.success("Name saved") });
  };

  const remove = (force: boolean) =>
    del.mutate(
      { id: person.id, force },
      {
        onSuccess: () => toast.success(`Removed ${person.name}`),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409 && err.data.usage_count) setConfirm(Number(err.data.usage_count));
          else toast.error(err.message);
        },
      },
    );

  return (
    <li className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-stone-200/80 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowColors((s) => !s)}
          className="cursor-pointer rounded-full"
          aria-label={`Change color for ${person.name}`}
          aria-expanded={showColors}
        >
          <Avatar person={{ ...person, name: name || person.name }} />
        </button>
        <input
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Name"
          className="h-9 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm font-medium outline-none hover:bg-stone-50 focus:bg-stone-50 focus:ring-2 focus:ring-brand-500 dark:hover:bg-stone-800 dark:focus:bg-stone-800"
        />
        <Button variant="ghost" size="icon" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move up">
          <ArrowUp className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move down">
          <ArrowDown className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={!canDelete || del.isPending}
          onClick={() => remove(false)}
          aria-label={`Remove ${person.name}`}
          className="hover:text-red-600"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {showColors && (
        <div className="flex flex-wrap gap-2 px-1 pb-1 pt-3">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => {
                save.mutate({ id: person.id, color: c });
                setShowColors(false);
              }}
              className={clsx("flex size-7 cursor-pointer items-center justify-center rounded-full transition hover:scale-110")}
              style={{ backgroundColor: c }}
            >
              {c === person.color && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      )}

      {confirm !== null && (
        <div className="m-1 mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {person.name} has {confirm} planned meal{confirm === 1 ? "" : "s"}. Removing {person.name} also removes those.
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" disabled={del.isPending} onClick={() => remove(true)}>
              Remove anyway
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
