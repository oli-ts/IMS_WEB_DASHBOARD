"use client";
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Button } from "../../components/ui/button";

function Column({ title, items }) {
  return (
    <div className="flex-1 bg-white dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 p-3">
      <div className="font-semibold mb-2">{title}</div>
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="p-2 rounded border dark:border-neutral-800">
            {i.item_uid}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Transfers() {
  const sb = supabaseBrowser();
  const [left, setLeft] = useState([]);
  const [right, setRight] = useState([]);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("manifest_items")
        .select("id,item_uid,manifest_id")
        .limit(20);
      setLeft((data || []).slice(0, 10));
      setRight((data || []).slice(10));
    })();
  }, []);

  function save() {
    /* call Edge Function or insert transaction rows for transfer */
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transfers</h1>
        <Button onClick={save}>Save Changes</Button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Column title="Manifest A" items={left} />
        <Column title="Manifest B" items={right} />
      </div>
    </div>
  );
}
