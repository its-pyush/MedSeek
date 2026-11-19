"use client";

import { setBodySex, type BodySex } from "@/lib/bodySex";

/** Asked once, before the 3D body is shown. */
export function BodySexChooser({ className = "" }: { className?: string }) {
  const choose = (value: BodySex) => () => setBodySex(value);
  return (
    <div className={`flex items-center justify-center p-4 ${className}`}>
      <div className="glass-panel rounded-2xl p-5 sm:p-6 w-full max-w-sm text-center shadow-lg" role="group" aria-labelledby="body-sex-title">
        <h2 id="body-sex-title" className="text-lg font-bold text-slate-900">
          Which body should we show?
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          This also tailors the results, for example to pregnancy or prostate conditions. You can change it any time.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" id="body-sex-female" onClick={choose("female")} className="btn-3d-primary h-11 rounded-xl text-sm font-semibold">
            Female
          </button>
          <button type="button" id="body-sex-male" onClick={choose("male")} className="btn-3d-primary h-11 rounded-xl text-sm font-semibold">
            Male
          </button>
        </div>
        <button
          type="button"
          id="body-sex-skip"
          onClick={choose("unspecified")}
          className="mt-3 text-sm text-slate-500 hover:text-slate-800 underline underline-offset-4"
        >
          Prefer not to say
        </button>
      </div>
    </div>
  );
}

/** Small Female | Male switch shown on top of the body. */
export function BodySwitch({ value, className = "" }: { value: BodySex; className?: string }) {
  const options: { id: BodySex; label: string }[] = [
    { id: "female", label: "Female" },
    { id: "male", label: "Male" },
  ];
  return (
    <div className={`glass-chip inline-flex rounded-xl p-1 gap-1 shadow-sm ${className}`} role="radiogroup" aria-label="Body shown">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            id={`body-switch-${o.id}`}
            onClick={() => setBodySex(o.id)}
            className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
              on ? "btn-3d-primary" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
