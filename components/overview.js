"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabase-browser.js";
import { Card, CardContent, CardHeader } from "./ui/card";

export default function Overview() {
  const [kpi, setKpi] = useState({
    stock: 0,
    activeJobs: 0,
    exceptions: 0,
    lowStock: 0,
  });
  useEffect(() => {
    const sb = supabaseBrowser();
    async function load() {
      const [{ data: cons }, { data: jobs }, { data: ex }] = await Promise.all([
        sb.from("consumable_stock").select("uid"),
        sb.from("active_manifests").select("id"),
        sb.from("exceptions").select("id"),
      ]);
      setKpi({
        stock: cons?.length || 0,
        activeJobs: jobs?.length || 0,
        exceptions: ex?.length || 0,
        lowStock: 0,
      });
    }
    load();
  }, []);
  const cards = [
    { title: "Stock Items", value: kpi.stock },
    { title: "Active Jobs", value: kpi.activeJobs },
    { title: "Exceptions", value: kpi.exceptions },
    { title: "Low Stock Alerts", value: kpi.lowStock },
  ];
  return (
    <div className="grid md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader>{c.title}</CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
