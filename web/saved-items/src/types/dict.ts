/** Dict lookup types matching bridge /dict and content script UI. */

export interface DictSense {
  gloss_en: string[];
  gloss_vi: string[];
  reading?: string;
  pos?: string[];
}

export interface DictResponse {
  surface: string;
  matched?: string;
  reading?: string;
  hanviet?: string;
  found: boolean;
  glosses_vi?: string[];
  senses?: DictSense[];
  message?: string;
}

export interface DictRequest {
  surface: string;
  lemma?: string;
  sentence_id?: string;
  context_tokens?: string[];
}
