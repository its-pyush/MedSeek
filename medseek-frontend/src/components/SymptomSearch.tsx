"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { autocompleteSymptoms, AutocompleteItem } from "@/lib/api";

interface SymptomSearchProps {
  onSearch: (symptoms: string[]) => void;
  isLoading?: boolean;
}

export default function SymptomSearch({ onSearch, isLoading = false }: SymptomSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
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
      // Filter out already-selected symptoms
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

    // Debounced autocomplete
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  // ─── Selection handlers ──────────────────────────────────────

  const addSymptom = (name: string) => {
    if (!selectedSymptoms.includes(name)) {
      setSelectedSymptoms((prev) => [...prev, name]);
    }
    setInputValue("");
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeSymptom = (name: string) => {
    setSelectedSymptoms((prev) => prev.filter((s) => s !== name));
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

  // ─── Cleanup timer ───────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Search input container */}
      <div className="relative">
        <div className="flex items-center flex-wrap gap-2 rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:focus-within:ring-indigo-400/10 transition-all shadow-sm hover:shadow-md">
          {/* Search icon */}
          <svg
            className="w-5 h-5 text-zinc-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          {/* Selected symptom chips */}
          {selectedSymptoms.map((symptom) => (
            <span
              key={symptom}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 capitalize"
            >
              {symptom.replace(/_/g, " ")}
              <button
                type="button"
                onClick={() => removeSymptom(symptom)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
                aria-label={`Remove ${symptom}`}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </span>
          ))}

          {/* Text input */}
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
                : "Type your symptoms — e.g. headache, fever, fatigue..."
            }
            className="flex-1 min-w-[200px] bg-transparent text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none text-base"
            autoComplete="off"
            id="symptom-search-input"
          />

          {/* Search button */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={selectedSymptoms.length === 0 || isLoading}
            className="shrink-0 px-5 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-sm transition-all hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm hover:shadow-md"
            id="search-button"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Searching
              </span>
            ) : (
              "Search"
            )}
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50 max-h-72 overflow-y-auto"
            role="listbox"
            id="symptom-suggestions"
          >
            {suggestions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={() => addSymptom(item.name)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                  index === highlightedIndex
                    ? "bg-indigo-50 dark:bg-indigo-900/30"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                    {item.name.replace(/_/g, " ")}
                  </span>
                  {item.match_source === "synonym" && (
                    <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                      (matched: {item.matched_text})
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {Math.round(item.similarity * 100)}% match
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hint text */}
      {selectedSymptoms.length === 0 && (
        <p className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Enter one or more symptoms to find possible conditions.
          <br />
          <span className="text-xs">
            Try: <button type="button" onClick={() => addSymptom("headache")} className="text-indigo-600 dark:text-indigo-400 hover:underline">headache</button>{", "}
            <button type="button" onClick={() => addSymptom("fever")} className="text-indigo-600 dark:text-indigo-400 hover:underline">fever</button>{", "}
            <button type="button" onClick={() => addSymptom("fatigue")} className="text-indigo-600 dark:text-indigo-400 hover:underline">fatigue</button>
          </span>
        </p>
      )}
    </div>
  );
}
