import sys

sys.path.insert(0, "/app")

from fhirclient.models.fhirdate import FHIRDate
from fhirclient.models.identifier import Identifier
from fhirclient.models.patient import Patient

from app.fhir_client import get_fhir_client, list_fhir_patients

fhir = get_fhir_client()
patients_data = [
    ("Alice Johnson", "1985-03-15", "1234567890"),
    ("Bob Smith", "1972-07-22", "2345678901"),
    ("Carol Williams", "1990-11-08", "3456789012"),
    ("David Brown", "1988-05-30", "4567890123"),
    ("Emma Davis", "1995-09-14", "5678901234"),
]

existing = list_fhir_patients()

for idx, patient_dict in enumerate(existing):
    if idx >= len(patients_data):
        break

    name, dob, nhs = patients_data[idx]
    patient_id = patient_dict.get("id")

    patient = Patient.read(patient_id, fhir.server)
    patient.birthDate = FHIRDate(dob)

    identifier = Identifier()
    identifier.system = "https://fhir.nhs.uk/Id/nhs-number"
    identifier.value = nhs
    patient.identifier = [identifier]

    patient.update(fhir.server)
    print(f"Updated: {name} - DOB: {dob}, NHS: {nhs}")
