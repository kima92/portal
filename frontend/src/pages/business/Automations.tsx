import { useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { automationsApi } from "../../api/automations";
import type {
  AutomationActionType,
  AutomationRule,
} from "../../api/automations";
import { agentsApi } from "../../api/agents";
import { useAuthStore } from "../../store/auth";
import { isPlatformStaff } from "../../lib/roles";
import { Button, Card, Input, Spinner, Textarea } from "../../components/ui";
import { Icon } from "../../components/icons";

const RUN_AGENT_KEYS = [
  "marketing",
  "analytics",
  "accounting",
  "sales",
  "crm",
];

const TRIGGER_LABEL: Record<string, string> = {
  "lead.created": "ליד חדש נוצר",
  "message.received": "הודעה נכנסת מלקוח",
  "document.signed": "מסמך נחתם",
  "task.created": "משימה נוצרה",
};
const ACTION_LABEL: Record<AutomationActionType, string> = {
  create_task: "צור משימה",
  notify: "שלח התראה",
  run_agent: "הפעל סוכן",
};

export default function Automations() {
  const { businessId = "" } = useParams<{ businessId: string }>();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  // Operator (platform staff) defines automations; the client only toggles them.
  const isOperator = isPlatformStaff(user?.role);
  const [showForm, setShowForm] = useState(false);

  const rules = useQuery({
    queryKey: ["automations", businessId],
    queryFn: () => automationsApi.list(businessId),
    enabled: Boolean(businessId),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["automations", businessId] });

  const toggleMut = useMutation({
    mutationFn: (rule: AutomationRule) =>
      automationsApi.setEnabled(businessId, rule.id, !rule.enabled),
    onSuccess: invalidate,
  });
  const testMut = useMutation({
    mutationFn: (id: string) => automationsApi.test(businessId, id),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => automationsApi.remove(businessId, id),
    onSuccess: invalidate,
  });

  const items = rules.data ?? [];

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 mb-1">אוטומציות</h1>
          <p className="text-navy-500 text-sm">
            "כשקורה X — תעשה Y". הרקמה שמחברת בין כל חלקי המערכת.
          </p>
        </div>
        {!showForm && isOperator && (
          <Button onClick={() => setShowForm(true)}>+ אוטומציה חדשה</Button>
        )}
      </header>

      {showForm && (
        <RuleForm
          businessId={businessId}
          onDone={() => {
            setShowForm(false);
            invalidate();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {rules.isLoading && <div className="text-navy-400 text-sm">טוען...</div>}
      {!rules.isLoading && items.length === 0 && !showForm && (
        <Card className="p-12 text-center text-navy-400">
          {isOperator
            ? 'אין אוטומציות עדיין. צור כלל ראשון, למשל "ליד חדש ← צור משימת מעקב".'
            : "עדיין לא הוגדרו לך אוטומציות. נגדיר עבורך כללים שתוכל להפעיל בלחיצה."}
        </Card>
      )}

      <div className="space-y-3">
        {items.map((rule) => (
          <Card key={rule.id} className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => toggleMut.mutate(rule)}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  rule.enabled ? "bg-teal-400" : "bg-navy-200"
                }`}
                aria-label={rule.enabled ? "כבה" : "הפעל"}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    rule.enabled ? "start-0.5" : "end-0.5"
                  }`}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-navy-900 text-sm">
                  {rule.name}
                </div>
                <div className="text-xs text-navy-500 mt-0.5 flex items-center gap-1">
                  <span>
                    כש<span className="font-medium">
                      {TRIGGER_LABEL[rule.trigger] ?? rule.trigger}
                    </span>
                  </span>
                  <Icon name="arrow-end" size={12} className="shrink-0" />
                  <span>
                    {rule.actions
                      .map((a) => ACTION_LABEL[a.type] ?? a.type)
                      .join(", ")}
                  </span>
                </div>
              </div>
              <span className="text-xs text-navy-400 shrink-0">
                הופעל {rule.runCount}×
              </span>
              {isOperator && (
                <>
                  <button
                    onClick={() => testMut.mutate(rule.id)}
                    className="text-xs text-brand-600 hover:text-brand-700 shrink-0"
                  >
                    בדיקה
                  </button>
                  <button
                    onClick={() => removeMut.mutate(rule.id)}
                    className="text-navy-300 hover:text-coral-500 shrink-0"
                    aria-label="מחק"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RuleForm({
  businessId,
  onDone,
  onCancel,
}: {
  businessId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("lead.created");
  const [actionType, setActionType] = useState<AutomationActionType>(
    "create_task",
  );
  const [actionTitle, setActionTitle] = useState("");
  const [agentKey, setAgentKey] = useState("marketing");
  const [instruction, setInstruction] = useState("");

  const agents = useQuery({ queryKey: ["me", "agents"], queryFn: agentsApi.mine });
  const runnableAgents = (agents.data ?? []).filter((a) =>
    RUN_AGENT_KEYS.includes(a.key),
  );

  const createMut = useMutation({
    mutationFn: () =>
      automationsApi.create(businessId, {
        name,
        trigger,
        enabled: true,
        actions: [
          {
            type: actionType,
            params:
              actionType === "run_agent"
                ? { agentKey, instruction }
                : { title: actionTitle || name },
          },
        ],
      }),
    onSuccess: onDone,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) createMut.mutate();
  }

  return (
    <Card className="p-5 mb-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1.5">
            שם הכלל
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: מעקב אחרי ליד חדש"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">
              כאשר (טריגר)
            </label>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              className="block w-full rounded-xl border border-navy-200 bg-white px-3.5 h-11 text-sm text-navy-900"
            >
              {Object.entries(TRIGGER_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">
              אז (פעולה)
            </label>
            <select
              value={actionType}
              onChange={(e) =>
                setActionType(e.target.value as AutomationActionType)
              }
              className="block w-full rounded-xl border border-navy-200 bg-white px-3.5 h-11 text-sm text-navy-900"
            >
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        {actionType === "run_agent" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">
                איזה סוכן להפעיל
              </label>
              <select
                value={agentKey}
                onChange={(e) => setAgentKey(e.target.value)}
                className="block w-full rounded-xl border border-navy-200 bg-white px-3.5 h-11 text-sm text-navy-900"
              >
                {runnableAgents.length === 0 && (
                  <option value="marketing">סוכן שיווק</option>
                )}
                {runnableAgents.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">
                הוראה לסוכן (אופציונלי)
              </label>
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="לדוגמה: נסח הודעת מעקב ללקוח. אם ריק — הסוכן יפעל לפי ההקשר של האירוע."
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1.5">
              {actionType === "notify" ? "כותרת ההתראה" : "כותרת המשימה"}
            </label>
            <Input
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              placeholder="טקסט שיופיע כשהכלל מופעל"
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createMut.isPending}>
            {createMut.isPending ? <Spinner /> : "צור אוטומציה"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            ביטול
          </Button>
        </div>
      </form>
    </Card>
  );
}
