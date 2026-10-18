use serde_json::Value;
pub const MAX_STEP_BYTES:usize=16*1024*1024;
pub fn validate(text:&str)->Result<Option<Value>,String>{
    let mut value:Value=serde_json::from_str(text).map_err(|error|format!("Invalid JSON: {error}"))?;
    let kind=value.get("type").and_then(Value::as_str).unwrap_or("");
    if !matches!(kind,"brep.update"|"brep.clear"){return Ok(None)}
    let source=value.get("source").and_then(Value::as_str).ok_or("B-rep source is required")?;
    if source.trim().is_empty()||source.chars().count()>120{return Err("B-rep source must be 1–120 characters".into())}
    if let Some(label)=value.get("label"){if label.as_str().map(|s|s.chars().count()>120).unwrap_or(true){return Err("Invalid B-rep label".into())}}
    if kind=="brep.update"{let step=value.get("step").and_then(Value::as_str).ok_or("STEP content is required")?;
        if step.len()>MAX_STEP_BYTES||!step.trim_start().starts_with("ISO-10303-21;")||!step.trim_end().ends_with("END-ISO-10303-21;"){return Err("Send a valid STEP document smaller than 16 MB".into())}
    }
    let object=value.as_object_mut().ok_or("Invalid B-rep update")?;object.remove("bridgeRevision");
    Ok(Some(value))
}
#[cfg(test)]mod tests{use super::*;
#[test]fn brep_transport_checks_exact_step_without_accepting_file_paths(){let good=serde_json::json!({"type":"brep.update","source":"gh:box","step":"ISO-10303-21;\nEND-ISO-10303-21;","bridgeRevision":999});let result=validate(&good.to_string()).unwrap().unwrap();assert!(result.get("bridgeRevision").is_none());assert!(validate(r#"{"type":"brep.update","source":"x","step":"/private/model.step"}"#).is_err());assert!(validate(r#"{"type":"brep.update","source":"","step":""}"#).is_err());assert!(validate(r#"{"type":"brep.clear","source":"x"}"#).unwrap().is_some());assert!(validate(r#"{"type":"toolpath.update"}"#).unwrap().is_none());}
}
