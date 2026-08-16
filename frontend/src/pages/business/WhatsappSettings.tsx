import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappApi, type WhatsappStatus } from "../../api/whatsapp";
import { apiErrorMessage } from "../../api/client";
import { Button, Card, FormError, Spinner } from "../../components/ui";
import { Icon } from "../../components/icons";

function statusBadge(
  status: WhatsappStatus | undefined,
  labels: Record<WhatsappStatus, string>,
) {
  if (!status) return null;
  const tone =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "failed"
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";
  return (
    <span
      className={`inline-block rounded-full text-xs px-2.5 py-0.5 font-medium ${tone}`}
    >
      {labels[status]}
    </span>
  );
}

export default function WhatsappSettings() {
  const { t } = useTranslation();
  const { businessId = "" } = useParams<{ businessId: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");

  const conn = useQuery({
    queryKey: ["whatsapp", businessId],
    queryFn: () => whatsappApi.get(businessId),
    enabled: Boolean(businessId),
  });

  const connectKey = useMutation({
    mutationFn: () =>
      whatsappApi.connect360dialog(businessId, {
        apiKey: apiKey.trim(),
        displayPhoneNumber: displayNumber.trim() || undefined,
      }),
    onSuccess: () => {
      setApiKey("");
      setDisplayNumber("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["whatsapp", businessId] });
    },
    onError: (err) => setError(apiErrorMessage(err, "החיבור נכשל")),
  });

  const remove = useMutation({
    mutationFn: () => whatsappApi.delete(businessId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp", businessId] }),
  });

  const statusLabels: Record<WhatsappStatus, string> = {
    pending: t("whatsapp.statusPending"),
    active: t("whatsapp.statusActive"),
    failed: t("whatsapp.statusFailed"),
  };

  const isConnected = conn.data?.status === "active";

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("whatsapp.title")}</h1>
          <p className="text-neutral-600 text-sm mt-1">
            {t("whatsapp.subtitle")}
          </p>
        </div>
        {conn.data && statusBadge(conn.data.status, statusLabels)}
      </header>

      {conn.data?.lastError && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50">
          <div className="text-xs uppercase text-red-700 font-semibold mb-1">
            {t("whatsapp.lastError")}
          </div>
          <div className="text-sm text-red-800 font-mono break-all" dir="ltr">
            {conn.data.lastError}
          </div>
        </Card>
      )}

      <Card className="p-6 mb-6">
        {isConnected && conn.data ? (
          <div className="space-y-3">
            <div className="text-sm text-neutral-700">
              {t("whatsapp.connectedTo")}
            </div>
            <div className="text-lg font-semibold" dir="ltr">
              {conn.data.displayPhoneNumber ?? conn.data.phoneNumberId}
            </div>
            <div className="text-xs text-neutral-500 font-mono break-all" dir="ltr">
              waba_id: {conn.data.wabaId ?? "—"}
              {" · "}phone_number_id: {conn.data.phoneNumberId ?? "—"}
            </div>
            {conn.data.connectedAt && (
              <div className="text-xs text-neutral-500">
                {t("whatsapp.connectedAt", {
                  date: new Date(conn.data.connectedAt).toLocaleString(),
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold mb-1">
                חיבור עם מפתח 360dialog
              </h2>
              <p className="text-sm text-neutral-600">
                בפגישת ההקמה עם הלקוח: אחרי שהוא חיבר את המספר ב־360dialog, הדבק
                כאן את מפתח ה־API שלו. נאמת אותו ונחבר את המספר אוטומטית — הלקוח
                לא צריך לגעת בכלום.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                מפתח API (D360-API-KEY)
              </label>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="הדבק כאן את המפתח…"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm font-mono"
                dir="ltr"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                מספר לתצוגה (לא חובה)
              </label>
              <input
                value={displayNumber}
                onChange={(e) => setDisplayNumber(e.target.value)}
                placeholder="+972 50-123-4567"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                dir="ltr"
                autoComplete="off"
              />
            </div>

            <Button
              disabled={apiKey.trim().length < 8 || connectKey.isPending}
              onClick={() => {
                setError(null);
                connectKey.mutate();
              }}
            >
              {connectKey.isPending ? (
                <>
                  <Spinner /> מחבר…
                </>
              ) : (
                "חבר וואטסאפ"
              )}
            </Button>
            <FormError message={error} />

            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer select-none">
                איפה הלקוח מוצא את המפתח?
              </summary>
              <ol className="list-decimal ms-5 mt-2 space-y-1">
                <li>נכנסים ל־360dialog Hub של הלקוח.</li>
                <li>
                  בוחרים את המספר{" "}
                  <Icon name="arrow-end" size={11} className="inline align-[-1px]" />{" "}
                  API Key.
                </li>
                <li>מייצרים מפתח (Generate) ומעתיקים — מדביקים כאן.</li>
              </ol>
            </details>
          </div>
        )}
      </Card>

      {isConnected && (
        <Card className="p-6 border-red-200">
          <div className="text-sm text-neutral-600 mb-3">
            {t("whatsapp.disconnectIntro")}
          </div>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(t("whatsapp.disconnectConfirm"))) remove.mutate();
            }}
          >
            {t("whatsapp.disconnect")}
          </Button>
        </Card>
      )}
    </div>
  );
}
