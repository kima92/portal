import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  contactsApi,
  conversationsApi,
  type ContactStatus,
  type Message,
  type MessageRole,
} from "../../api/conversations";
import { leadsApi } from "../../api/leads";
import { privacyApi } from "../../api/privacy";
import { apiErrorMessage } from "../../api/client";
import { Button, Card, Spinner } from "../../components/ui";
import { Icon } from "../../components/icons";

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function roleClass(role: MessageRole): string {
  switch (role) {
    case "customer":
      return "self-start bg-white border border-neutral-200";
    case "bot":
      return "self-end bg-brand-600 text-white";
    case "agent":
      return "self-end bg-green-600 text-white";
    default:
      return "self-center bg-amber-50 border border-amber-200 text-amber-900 text-xs";
  }
}

export default function ContactDetail() {
  const {
    businessId = "",
    status = "lead",
    contactId = "",
  } = useParams<{ businessId: string; status: string; contactId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const card = useQuery({
    queryKey: ["contact", businessId, contactId],
    queryFn: () => contactsApi.card(businessId, contactId),
    enabled: Boolean(businessId && contactId),
  });

  const primaryConversation = card.data?.conversations[0] ?? null;
  const messages = useQuery({
    queryKey: ["messages", businessId, primaryConversation?.id],
    queryFn: () => conversationsApi.messages(businessId, primaryConversation!.id),
    enabled: Boolean(businessId && primaryConversation?.id),
  });

  const leads = useQuery({
    queryKey: ["leads", businessId],
    queryFn: () => leadsApi.list(businessId),
    enabled: Boolean(businessId),
  });
  const contactLeads = (leads.data ?? []).filter(
    (l) => l.customerContactId === contactId,
  );

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [st, setSt] = useState<ContactStatus>("lead");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);

  // Seed the editable fields once the card loads (or reloads with new data).
  const [seededCard, setSeededCard] = useState(card.data);
  if (card.data && card.data !== seededCard) {
    setSeededCard(card.data);
    setName(card.data.contact.displayName ?? "");
    setNotes(card.data.contact.notes ?? "");
    setSt(card.data.contact.status);
  }

  const save = useMutation({
    mutationFn: () =>
      contactsApi.update(businessId, contactId, {
        status: st,
        displayName: name.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      qc.invalidateQueries({ queryKey: ["contact", businessId, contactId] });
      qc.invalidateQueries({ queryKey: ["contacts", businessId] });
      qc.invalidateQueries({ queryKey: ["conversations", businessId] });
    },
    onError: (e) => setError(apiErrorMessage(e, "השמירה נכשלה")),
  });

  const erase = useMutation({
    mutationFn: () => privacyApi.eraseContact(businessId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", businessId] });
      qc.invalidateQueries({ queryKey: ["conversations", businessId] });
      qc.invalidateQueries({ queryKey: ["leads", businessId] });
      navigate(`/app/businesses/${businessId}/contacts/${status}`);
    },
    onError: (e) => setError(apiErrorMessage(e, "המחיקה נכשלה")),
  });

  if (card.isLoading || !card.data) {
    return (
      <div className="p-10 grid place-items-center">
        <Spinner />
      </div>
    );
  }

  const contact = card.data.contact;
  const phone = contact.phone || contact.externalId;

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-3xl mx-auto">
      <button
        type="button"
        onClick={() =>
          navigate(`/app/businesses/${businessId}/contacts/${status}`)
        }
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <Icon name="chevron-start" size={18} />
        חזרה
      </button>

      {/* Card: identity + status + notes */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-xl bg-brand-50 text-brand-700 p-2.5">
            <Icon name="user" size={22} />
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg leading-tight truncate">
              {name || phone}
            </div>
            <div className="text-xs text-neutral-500" dir="ltr">
              {phone}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-2">
              סטטוס
            </label>
            <div className="flex gap-2">
              {(["lead", "customer"] as ContactStatus[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSt(v)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    st === v
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {v === "customer" ? "לקוח" : "ליד"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-2">
              שם
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם הלקוח"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-2">
              הערות פרטיות
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="מה שחשוב לזכור על הלקוח (העדפות, רגישויות, הקשר)…"
              rows={3}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm resize-none"
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              הסוכן משתמש בזה כדי להכיר את הלקוח — לא נשלח ללקוח.
            </p>
          </div>

          {error && <div className="text-xs text-red-700">{error}</div>}

          <div className="flex items-center justify-between">
            <div className="text-xs text-neutral-400">
              {card.data.stats.messageCount} הודעות
            </div>
            <div className="flex gap-2">
              {primaryConversation && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(`/app/businesses/${businessId}/inbox`)
                  }
                >
                  פתח בשיחות
                </Button>
              )}
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
                {save.isPending ? (
                  <>
                    <Spinner /> שומר…
                  </>
                ) : saved ? (
                  "נשמר"
                ) : (
                  "שמירה"
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Captured lead detail, if any */}
      {contactLeads.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-neutral-500 mb-2">
            פניות שנקלטו
          </h2>
          <div className="space-y-2">
            {contactLeads.map((l) => (
              <Card key={l.id} className="p-3">
                <div className="text-sm font-medium">{l.interest}</div>
                {l.notes && (
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {l.notes}
                  </div>
                )}
                {l.sourceDetail && (
                  <div className="text-[11px] text-neutral-400 mt-1">
                    מקור: {l.sourceDetail}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Conversation history, grouped by day */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-500 mb-3">
          היסטוריית שיחה
        </h2>
        {!primaryConversation && (
          <Card className="p-6 text-sm text-neutral-500 text-center">
            אין עדיין שיחה עם הלקוח הזה.
          </Card>
        )}
        {primaryConversation && (
          <Card className="p-4">
            <div className="flex flex-col gap-2">
              {messages.isLoading && (
                <div className="text-sm text-neutral-500">טוען…</div>
              )}
              {messages.data?.map((m: Message, idx) => {
                const prev = messages.data![idx - 1];
                const showDay =
                  !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                if (m.role === "system") return null;
                return (
                  <div key={m.id} className="contents">
                    {showDay && (
                      <div className="self-center my-2">
                        <span className="inline-block rounded-full bg-neutral-200/70 text-neutral-600 text-[11px] px-3 py-1">
                          {dayLabel(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${roleClass(
                        m.role,
                      )}`}
                    >
                      {m.content}
                      <div className="text-[10px] opacity-70 mt-1">
                        {timeShort(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Right-to-be-forgotten: permanent erase of this customer's data */}
      <div className="mt-10 rounded-2xl border border-red-200 bg-red-50/50 p-4">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-red-100 text-red-700 p-1.5">
            <Icon name="trash" size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-red-900">
              מחיקת הלקוח וכל המידע שלו
            </div>
            <p className="mt-1 text-xs leading-relaxed text-red-700/90">
              מוחק לצמיתות את איש הקשר, כל השיחות, ההודעות, הפגישות והפניות שלו.
              פעולה בלתי הפיכה — לשימוש בבקשת "מחקו אותי" (הזכות להישכח).
            </p>

            {!confirmErase ? (
              <button
                type="button"
                onClick={() => setConfirmErase(true)}
                className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
              >
                מחיקת לקוח
              </button>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => erase.mutate()}
                  disabled={erase.isPending}
                >
                  {erase.isPending ? (
                    <>
                      <Spinner /> מוחק…
                    </>
                  ) : (
                    "כן, מחק לצמיתות"
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setConfirmErase(false)}
                  disabled={erase.isPending}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
                >
                  ביטול
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
