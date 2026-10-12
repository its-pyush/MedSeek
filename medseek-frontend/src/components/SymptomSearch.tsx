"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { autocompleteSymptoms, AutocompleteItem } from "@/lib/api";
import { IconSearch, IconClose, IconCrosshair } from "./icons";

interface SymptomSearchProps {
  onSearch: (symptoms: string[]) => void;
  selectedSymptoms?: string[];
  onSymptomsChange?: (symptoms: string[]) => void;
  isLoading?: boolean;
}

export default function SymptomSearch({
  onSearch,
  selectedSymptoms: controlledSymptoms,
  onSymptomsChange,
  isLoading = false,
}: SymptomSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [internalSymptoms, setInternalSymptoms] = useState<string[]>([]);
  const selectedSymptoms = controlledSymptoms ?? internalSymptoms;
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Autocomplete fetch with debounce ────────────────────────

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    try {
      const result = await autocompleteSymptoms(query);
      const filtered = result.data.filter(
        (item) => !selectedSymptoms.includes(item.name)
      );
      setSuggestions(filtered);
      setShowDropdown(filtered.length > 0);
      setHighlightedIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, [selectedSymptoms]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(value), 250);
  };

  // ─── Selection handlers ──────────────────────────────────────

  const updateSymptoms = useCallback(
    (newSymptoms: string[]) => {
      if (controlledSymptoms === undefined) {
        setInternalSymptoms(newSymptoms);
      }
      if (onSymptomsChange) {
        onSymptomsChange(newSymptoms);
      }
    },
    [controlledSymptoms, onSymptomsChange]
  );

  const addSymptom = (name: string) => {
    if (!selectedSymptoms.includes(name)) {
      const newSymptoms = [...selectedSymptoms, name];
      updateSymptoms(newSymptoms);
    }
    setInputValue("");
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeSymptom = (name: string) => {
    const newSymptoms = selectedSymptoms.filter((s) => s !== name);
    updateSymptoms(newSymptoms);
  };

  // ─── Keyboard navigation ────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        addSymptom(suggestions[highlightedIndex].name);
      } else if (selectedSymptoms.length > 0) {
        handleSearch();
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    } else if (
      e.key === "Backspace" &&
      inputValue === "" &&
      selectedSymptoms.length > 0
    ) {
      removeSymptom(selectedSymptoms[selectedSymptoms.length - 1]);
    }
  };

  // ─── Search submit ───────────────────────────────────────────

  const handleSearch = () => {
    if (selectedSymptoms.length > 0) {
      onSearch(selectedSymptoms);
    }
  };

  // ─── Click outside to close dropdown ─────────────────────────

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Search Input Container - Tightened & Clinical */}
      <div className="relative">
        <div className="glass-search-console flex items-center flex-wrap gap-1.5 sm:gap-2 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5">
          {/* Diagnostic Crosshair Search Icon */}
          <IconSearch size={18} className="text-[#3a5ebb] shrink-0" />

          {/* Selected Symptom Chips */}
          {selectedSymptoms.map((symptom) => (
            <span
              key={symptom}
              className="glass-chip inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[#2a4693] text-xs font-semibold capitalize"
            >
              {symptom.replace(/_/g, " ")}
              <button
                type="button"
                onClick={() => removeSymptom(symptom)}
                className="p-0.5 text-[#3a5ebb] hover:text-[#1c337a] transition-colors"
                aria-label={`Remove ${symptom}`}
              >
                <IconClose size={12} />
              </button>
            </span>
          ))}

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            placeholder={
              selectedSymptoms.length > 0
                ? "Add more symptoms..."
                : "Type clinical signs or symptoms (e.g. fever, headache, chest pain)..."
            }
            className="flex-1 min-w-[140px] sm:min-w-[180px] bg-transparent text-slate-900 placeholder:text-slate-400 outline-none text-xs sm:text-sm font-normal py-0.5"
            autoComplete="off"
            id="symptom-search-input"
          />

          {/* Diagnostic Run Button */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={selectedSymptoms.length === 0 || isLoading}
            className="btn-3d-primary w-full sm:w-auto shrink-0 px-4 py-1.5 rounded-lg text-xs tracking-tight transition-all flex items-center justify-center gap-1.5"
            id="search-button"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Evaluating...
              </span>
            ) : (
              "Differential Search"
            )}
          </button>
        </div>

        {/* Autocomplete Dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="glass-dropdown absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 max-h-60 overflow-y-auto"
            role="listbox"
            id="symptom-suggestions"
          >
            <div className="px-3.5 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200/60 bg-white/50">
              Diagnostic Index Matches
            </div>
            {suggestions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={() => addSymptom(item.name)}
                className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs border-b border-slate-100/80 last:border-0 transition-colors ${
                  index === highlightedIndex
                    ? "bg-[#3a5ebb]/10 text-[#203a80] border-l-3 border-l-[#3a5ebb] font-semibold"
                    : "hover:bg-white/70 text-slate-800 border-l-3 border-l-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <IconCrosshair size={14} className={index === highlightedIndex ? "text-[#3a5ebb]" : "text-slate-400"} />
                  <span className="capitalize">
                    {item.name.replace(/_/g, " ")}
                  </span>
                  {item.match_source === "synonym" && (
                    <span className="text-[11px] text-slate-500 font-normal">
                      (synonym: <span className="text-[#3a5ebb] font-medium">{item.matched_text}</span>)
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {Math.round(item.similarity * 100)}%
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
