/**
 * Terms of service.
 *
 * Served at /terms-of-service. This file is the one source of the terms of service: there
 * is no Markdown copy anywhere else. The text was reviewed by the East of
 * England Endoscopy Training Academy (EoEETA), who cleared it for use,
 * and it went live on 20 November 2026.
 *
 * Every version carries a version number and the date it took effect,
 * because acceptance is not recorded per person, so that date is the
 * only record of which version somebody was shown. Any change to the
 * wording is a new version: raise VERSION, set EFFECTIVE, and keep the
 * text it replaces findable in git history under its version number,
 * because the terms of service promises to send a copy of any earlier version on
 * request.
 */

import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import { Link, List, Section } from "../statementParts";
import "../global-styles";
import { createRoot } from "react-dom/client";

const VERSION = "1.0";

const EFFECTIVE = "20 October 2026";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Terms of service" />
            <PublicBodyText justify="centre">
              Version {VERSION}, effective {EFFECTIVE}.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="md" py="xl">
          <Stack gap="xl" py="xl">
            <Section title="In short">
              <List
                items={[
                  <>
                    Quill Medical is run by Bailey Medics Ltd, a company in
                    England and Wales. These terms are a contract between you
                    (the end-user) and us (Quill Medical).
                  </>,
                  <>
                    You use Quill Medical in one of two ways: through an
                    organisation that trains or employs you (your sponsor), or
                    by dealing with us directly. <strong>Part A</strong> applies
                    to everyone, <strong>Part B</strong> to people with a
                    sponsor, and <strong>Part C</strong> to people and
                    organisations who deal with Quill Medical directly.
                  </>,
                  <>
                    Quill Medical provides services for medical education and
                    for recording training (Portfolio). Nothing in it is
                    clinical advice, and nothing in it replaces your own
                    judgement or your local guidelines.
                  </>,
                  <>
                    Never put anything in Quill Medical that could identify a
                    patient. This includes anything you type into it and
                    messages to us.
                  </>,
                  <>
                    What you write stays yours. The organisation that assesses
                    you owns its assessment records. The teaching content
                    belongs to whoever made it. We own the software.
                  </>,
                ]}
              />
            </Section>
            <Section title="Part A: Terms for everyone">
              <PublicTitle
                title="1. Who we are and how to contact us"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                1.1 Quill Medical is a trading name of Bailey Medics Ltd, a
                company registered in England and Wales with company number
                15604352. Our registered office is Brooklands Place, Unit 5,
                Brooklands Road, Sale, Cheshire, M33 3SD. We are not registered
                for VAT.
              </PublicBodyText>
              <PublicBodyText>
                1.2 You can contact us at{" "}
                <Link href="mailto:info@quill-medical.com">
                  info@quill-medical.com
                </Link>
                , or, once signed in, with <strong>Feedback</strong> in the
                menu.
              </PublicBodyText>
              <PublicBodyText>
                1.3 &quot;Quill Medical&quot;, &quot;the service&quot;,
                &quot;we&quot;, &quot;us&quot; and &quot;our&quot; mean the
                Quill Medical service and Bailey Medics Ltd. &quot;You&quot;
                means the person or organisation using the service.
              </PublicBodyText>
              <PublicTitle
                title="2. Words used in these terms"
                size="sm"
                ta="left"
                c="white"
              />
              <List
                items={[
                  <>
                    <strong>Sponsor</strong> - an organisation that gives you
                    access to Quill Medical under an agreement with us, such as
                    a training academy, an NHS trust, a royal college, a medical
                    school or an employer. In Quill Medical a sponsor is set up
                    as one or more organisation units, and you will be placed
                    under one of these units.
                  </>,
                  <>
                    <strong>Sponsored user</strong> - somebody who uses Quill
                    Medical because a sponsor enrolled them, invited them, or
                    let them register into its programme.
                  </>,
                  <>
                    <strong>Direct customer</strong> - a person or organisation
                    that deals with us directly, with no sponsor&apos;s
                    agreement in between.
                  </>,
                  <>
                    <strong>Sponsor agreement</strong> - the written agreement
                    between a sponsor and us, including its data processing
                    schedule.
                  </>,
                  <>
                    <strong>Training records</strong> - your enrolments,
                    assessment attempts and answers, results and certificates.
                  </>,
                  <>
                    <strong>Content</strong> - the teaching modules, questions,
                    images, video, text and other material available through
                    Quill Medical.
                  </>,
                  <>
                    <strong>Your material</strong> - anything you write or send
                    us, such as feedback.
                  </>,
                ]}
              />
              <PublicTitle
                title="3. Which parts of these terms apply to you"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                3.1 <strong>Part A</strong> applies to everyone who uses Quill
                Medical.
              </PublicBodyText>
              <PublicBodyText>
                3.2 If a sponsor gave you access, <strong>Part B</strong>{" "}
                applies as well. Your sponsor&apos;s agreement with us governs
                how the service is provided to your sponsor and what we do with
                your training records on its behalf. Where that agreement and
                these terms say different things, the sponsor agreement prevails
                between your sponsor and us, and Part B prevails over the rest
                of these terms between you and us.
              </PublicBodyText>
              <PublicBodyText>
                3.3 If you deal with us directly, <strong>Part C</strong>{" "}
                applies as well. If you are an organisation that deals with us
                directly, your own written agreement with us prevails over these
                terms where they differ, and the people you give access to are
                sponsored users with you as their sponsor.
              </PublicBodyText>
              <PublicBodyText>
                3.4 You can be in both situations at once, for example if you
                have a direct account and a sponsor later enrols you in its
                programme. Part B then applies to what you do within that
                sponsor&apos;s programme, and Part C to the rest.
              </PublicBodyText>
              <PublicBodyText>
                3.5 By creating an account, or by using Quill Medical after
                being given an account, you agree to these terms. If you do not
                agree, do not use Quill Medical.
              </PublicBodyText>
              <PublicTitle
                title="4. Your account"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                4.1 Quill Medical is for healthcare professionals, those in
                training, the people who teach and assess them, and the
                organisations that run provide training. You{" "}
                <strong>must be 18 or over</strong> to use Quill Medical.
              </PublicBodyText>
              <PublicBodyText>
                4.2 You must give us accurate details and keep them up to date:
                your name, your email address and, where a feature asks for it,
                your professional registration.
              </PublicBodyText>
              <PublicBodyText>
                4.3 Your account is personal. One person, one account. You must
                not share your login with anyone, including a colleague, and you
                must not use anyone else&apos;s. If we have reason to think an
                account is shared we may ask you to confirm who is using it, and
                we may suspend it. You are responsible for what is done with
                your account until you tell us it has been compromised.
              </PublicBodyText>
              <PublicBodyText>
                4.4 Keep your password secret and choose one you use nowhere
                else. Two-factor authentication is available in{" "}
                <strong>Settings</strong> and we recommend it. Tell us at once
                if you think somebody else has used your account.
              </PublicBodyText>
              <PublicBodyText>
                4.5 We will send an email to verify your address when you
                register. You cannot sign in until it is verified, and if you
                change your email address you must verify the new one.
              </PublicBodyText>
              <PublicBodyText>
                4.6 Quill Medical is provided for people in the United Kingdom.
                If you use it from elsewhere, you do so on these terms, and you
                are responsible for following any local law that applies to you.
              </PublicBodyText>
              <PublicTitle
                title="5. Using Quill Medical"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>5.1 You must not:</PublicBodyText>
              <List
                items={[
                  <>
                    enter anything that could identify a patient, anywhere in
                    Quill Medical. This includes names, dates of birth, hospital
                    numbers, dates and places of treatment, and rare
                    combinations of details that would let somebody work out who
                    a patient is;
                  </>,
                  <>
                    share assessment questions, answers or marking schemes with
                    anyone, or keep copies of them;
                  </>,
                  <>
                    take an assessment for somebody else, let somebody else take
                    one for you, or get help during an assessment that the
                    module does not allow;
                  </>,
                  <>
                    submit work produced by an AI tool as if it were your own in
                    an assessment;
                  </>,
                  <>
                    copy, download, screenshot, screen-record, scrape or
                    redistribute content, or use content or your access to Quill
                    Medical to build or train any AI system;
                  </>,
                  <>
                    try to get round access controls, test the security of Quill
                    Medical without our written permission, or interfere with
                    the service for other users;
                  </>,
                  <>
                    use Quill Medical to harass, abuse or deceive anyone, or to
                    break the law;
                  </>,
                  <>
                    use Quill Medical for anything other than education,
                    training and the keeping of training records.
                  </>,
                ]}
              />
              <PublicBodyText>
                5.2 If you believe there is a security problem in Quill Medical,
                tell us at{" "}
                <Link href="mailto:info@quill-medical.com">
                  info@quill-medical.com
                </Link>{" "}
                rather than demonstrating it.
              </PublicBodyText>
              <PublicTitle
                title="6. Teaching content, images and video"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                6.1 Content is owned by whoever made it. Modules supplied by a
                sponsor or a content partner remain theirs. The Quill Medical
                software, design and trademarks are ours. Nothing in these terms
                gives you ownership of any of it.
              </PublicBodyText>
              <PublicBodyText>
                6.2 We grant you a personal, non-transferable licence to view
                and use content within Quill Medical for your own education and
                training for as long as you have access to it. You must not copy
                it, share it or use it for anything else, and you must not
                remove any notice of who owns it.
              </PublicBodyText>
              <PublicBodyText>
                6.3 Clinical images and video in content, such as endoscopy
                video and still images, are supplied by the organisation or
                author responsible for the module, which is often the sponsor
                itself. They are responsible for having the right to use the
                material for teaching and for removing anything that could
                identify a patient before it reaches Quill Medical. If you see
                anything in content that you think identifies a patient, tell us
                and we will remove it while we check.
              </PublicBodyText>
              <PublicBodyText>
                6.4 Whoever contributes content, whether a sponsor, a content
                partner or an individual author, confirms that they have the
                right to let us use it for teaching, that any patient recording
                in it was made as part of care or with the patient&apos;s
                consent, that it has been anonymised so far as possible, and
                that using it for teaching breaches no duty of confidence. They
                grant us, and any sponsor it is supplied to, a licence to use it
                for teaching within Quill Medical, and they keep ownership of
                it. For a sponsor, its sponsor agreement sets out these
                confirmations and this licence, and prevails where the two
                differ.
              </PublicBodyText>
              <PublicTitle
                title="7. Assessments, results and certificates"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                7.1 A result recorded in Quill Medical is evidence for whoever
                is responsible for your training, and for your own record. It is
                not a professional qualification, a registration or a licence,
                and it does not by itself authorise you to do anything. Whether
                a result counts towards a qualification, an accreditation or a
                decision about your practice is for your sponsor or the relevant
                professional body to decide under its own rules.
              </PublicBodyText>
              <PublicBodyText>
                7.2 Pass marks and time limits are set by the module and by your
                sponsor, and are shown before you start. We may change a
                module&apos;s content or questions between versions. A result
                stays attached to the version of the module you took.
              </PublicBodyText>
              <PublicBodyText>
                7.3 A certificate issued through Quill Medical records that you
                completed a module&apos;s assessment, when, and with what
                result. It carries the name on your account, so keep that
                accurate.
              </PublicBodyText>
              <PublicBodyText>
                7.4 We keep every attempt and every answer, not only your best
                result, because a person responsible for your training may need
                to see how you got there. Your sponsor sees what its agreement
                with us allows, which normally includes your attempts, answers,
                results and certificates. For a direct customer with no sponsor,
                nobody sees them but you and the people you choose to share them
                with.
              </PublicBodyText>
              <PublicBodyText>
                7.5 If we find that an assessment was taken in breach of clause
                5, we may mark the result invalid and tell your sponsor. We will
                tell you and give you a chance to respond.
              </PublicBodyText>
              <PublicBodyText>
                7.6 We do not promise that completing any module will lead to
                success in any examination, accreditation or application.
              </PublicBodyText>
              <PublicTitle
                title="8. Things you write"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                8.1 Your material stays yours. You grant us a licence to store
                it, display it to the people entitled to see it, back it up and
                make copies of it for export, where required, and no more. We do
                not use your material to train AI models.
              </PublicBodyText>
              <PublicBodyText>
                8.2 The rules on patient information in clause 5 apply to
                everything you write or send us, including feedback. If we find
                material that identifies a patient we may remove it or ask you
                to amend it, and where you have a sponsor we may tell your
                sponsor.
              </PublicBodyText>
              <PublicBodyText>
                8.3 If you use an AI tool to help you write, follow your
                sponsor&apos;s and your professional body&apos;s rules on
                declaring that, and never put anything that could identify a
                patient into an external AI tool.
              </PublicBodyText>
              <PublicTitle
                title="9. Education, not clinical advice"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                9.1 Quill Medical is an educational service. Content is provided
                for learning and for assessment. It is not clinical advice, it
                is not a substitute for your own professional judgement, and it
                does not replace your local guidelines, protocols or the advice
                of a senior colleague.
              </PublicBodyText>
              <PublicBodyText>
                9.2 You remain responsible for every clinical assessment,
                decision and action you take.
              </PublicBodyText>
              <PublicBodyText>
                9.3 Content is reviewed by the people who supply it, but
                medicine changes and mistakes happen. If you think something in
                a module is wrong, please tell us.
              </PublicBodyText>
              <PublicBodyText>
                9.4 Quill Medical is not a medical device and is not a clinical
                decision support tool. Do not use it in an emergency or to
                communicate about an individual patient&apos;s care. Quill
                Medical does not currently offer any feature for holding patient
                records.
              </PublicBodyText>
              <PublicTitle title="10. Email" size="sm" ta="left" c="white" />
              <PublicBodyText>
                10.1 We send service emails you cannot opt out of while you have
                an account: verifying your email address, resetting your
                password, invitations, certificates, reminders about modules you
                are enrolled in, a notice when an assessment you passed is due
                to be repeated, and notices about your account. Our privacy
                policy lists them. We send news and updates separately, and only
                if you have not said no. Our privacy policy explains how to stop
                them.
              </PublicBodyText>
              <PublicTitle
                title="11. Availability and changes to the service"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                11.1 We work to keep Quill Medical available, and we will give
                notice of planned maintenance where we can, but we do not
                promise that it will be available at any particular time, and
                these terms give no service level. A sponsor agreement may.
              </PublicBodyText>
              <PublicBodyText>
                11.2 We may add, change or withdraw features. If a change would
                materially reduce what you can do with Quill Medical, we will
                give at least 30 days&apos; notice by email or within the
                service, unless the change is needed for security or to comply
                with the law.
              </PublicBodyText>
              <PublicTitle
                title="12. Suspending or ending your access"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                12.1 You may close your account at any time by asking us, or by
                asking your sponsor if you have one. Download anything you want
                to keep first.
              </PublicBodyText>
              <PublicBodyText>
                12.2 We may suspend or end your access if you break these terms,
                if we reasonably believe your account is being misused, if the
                law requires it, or if your sponsor tells us to. Where we can,
                we will tell you why and give you a chance to put it right
                before we act. We will act without notice only where we
                reasonably believe that waiting would put the service, other
                users or patient information at risk.
              </PublicBodyText>
              <PublicBodyText>
                12.3 When your access ends, our privacy policy says what happens
                to your data and for how long we keep it. If you have a sponsor,
                its agreement with us decides what happens to your training
                records.
              </PublicBodyText>
              <PublicTitle
                title="13. Our responsibility to you"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                13.1 Nothing in these terms limits or excludes our liability for
                death or personal injury caused by our negligence, for fraud, or
                for anything else the law does not allow us to limit or exclude.
                If you are a consumer, nothing in these terms affects your legal
                rights.
              </PublicBodyText>
              <PublicBodyText>
                13.2 We are responsible only for loss or damage that is a
                foreseeable result of our breaking these terms or failing to use
                reasonable care and skill. We are not responsible for loss that
                was not foreseeable, for loss you could have avoided by taking
                reasonable steps, such as keeping your own copy of your
                certificates, or for loss caused by your breaking these terms.
              </PublicBodyText>
              <PublicBodyText>
                13.3 Quill Medical is supplied for your education and training.
                We are not responsible for business losses, including loss of
                income, loss of profit, loss of business or loss of contracts,
                and we are not responsible for any decision made about you by a
                sponsor, an employer or a professional body on the basis of a
                result recorded in Quill Medical.
              </PublicBodyText>
              <PublicBodyText>
                13.4 If you have paid us for your plan, our total liability to
                you under these terms is limited to the greater of the amount
                you paid us for your current plan and £100, except for the
                liability described in clause 13.1. If you have not paid us
                anything, our total liability to you is limited to £100, except
                for the liability described in clause 13.1.
              </PublicBodyText>
              <PublicBodyText>
                13.5 Unless you are also a direct customer who has agreed to pay
                us, you have no financial liability to us under these terms. You
                remain responsible for your own conduct under these terms and
                under your professional obligations.
              </PublicBodyText>
              <PublicBodyText>
                13.6 If you have a sponsor, liability between your sponsor and
                us is set by the sponsor agreement, not by this clause.
              </PublicBodyText>
              <PublicBodyText>
                13.7 We are not responsible for a delay or failure caused by
                events outside our reasonable control, such as the failure of a
                supplier&apos;s service, a power cut, or a cyber attack we could
                not reasonably have prevented. If one happens, we will tell you
                and do what we reasonably can to limit its effect.
              </PublicBodyText>
              <PublicBodyText>
                13.8 So far as the law allows, we are not responsible for errors
                in content written by a sponsor, a content partner or an author
                other than us (clause 6). If you tell us something in a module
                is wrong, we will pass it to whoever supplied it and remove it
                if it is unsafe.
              </PublicBodyText>
              <PublicTitle
                title="14. Changes to these terms"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                14.1 We may change these terms for one of these reasons: a
                change in the law or in regulatory guidance; a change to the
                service under clause 11; a security or safety reason; or to make
                the terms clearer. We will not use a change to reduce your
                rights without the notice below.
              </PublicBodyText>
              <PublicBodyText>
                14.2 For a change that is not minor we will give at least 30
                days&apos; notice by email or within the service before it takes
                effect. If you do not want to accept it, you may close your
                account before it takes effect, and if you have paid for a plan
                we will refund the unused part. If you carry on using Quill
                Medical after that date, you accept the new version.
              </PublicBodyText>
              <PublicBodyText>
                14.3 Terms carry a version number and the date it took effect,
                and earlier versions stay available on our website, so you can
                always see which version applied to you.
              </PublicBodyText>
              <PublicTitle
                title="15. Complaints, law and other matters"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                15.1 If something has gone wrong, email{" "}
                <Link href="mailto:info@quill-medical.com">
                  info@quill-medical.com
                </Link>
                . We aim to acknowledge a complaint within five working days and
                to resolve it within 30 days. Complaints about how your personal
                data is handled follow the process in our privacy policy.
              </PublicBodyText>
              <PublicBodyText>
                15.2 These terms are governed by the law of England and Wales,
                and the courts of England and Wales have jurisdiction over any
                dispute. If you are a consumer living in Scotland or Northern
                Ireland, you may also bring proceedings in your own courts.
              </PublicBodyText>
              <PublicBodyText>
                15.3 These terms, our privacy policy and our cookie policy are
                the whole agreement between you and us about your use of Quill
                Medical, unless you have a sponsor or a written agreement with
                us, as clause 3 describes.
              </PublicBodyText>
              <PublicBodyText>
                15.4 We may transfer our rights and obligations under these
                terms to another organisation. We will tell you if this happens
                and make sure the transfer does not affect your rights. You may
                not transfer yours.
              </PublicBodyText>
              <PublicBodyText>
                15.5 If a court finds part of these terms unenforceable, the
                rest still applies. If we delay enforcing these terms, we can
                still enforce them later. Nobody other than you and us has any
                rights under these terms.
              </PublicBodyText>
            </Section>
            <Section title="Part B: If you use Quill Medical through a sponsor">
              <PublicTitle
                title="16. Your sponsor's agreement comes first"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                16.1 Your sponsor has an agreement with us that governs the
                service it gives you. If there is a conflict between that
                agreement and these terms, the sponsor agreement prevails
                between your sponsor and us, and this Part prevails over the
                rest of these terms between you and us.
              </PublicBodyText>
              <PublicBodyText>
                16.2 Whoever gives you access, you accept these terms when you
                create your account or first sign in, and they are the terms on
                which we provide Quill Medical to you. It is your sponsor&apos;s
                responsibility, not ours, to tell you about its own policies for
                using Quill Medical, to give you its privacy notice, and to
                obtain any agreement from you that its own rules require.
              </PublicBodyText>
              <PublicTitle
                title="17. What your sponsor can do"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                17.1 Your sponsor decides who is enrolled, in which modules,
                with which permissions and for how long. It can create your
                account, change what you can do, enrol you, withdraw you, and
                end your access. It can ask us to act on its behalf, within the
                limits of its agreement and the law.
              </PublicBodyText>
              <PublicBodyText>
                17.2 Your sponsor decides who in their administrative team may
                see your training records. Those people see what their role
                allows and no more.
              </PublicBodyText>
              <PublicBodyText>
                17.3 If you already had an account with us when your sponsor
                enrolled you, your sponsor controls what you do within its
                programme and can see the training records made within it. It
                cannot see what you did or do outside its programme.
              </PublicBodyText>
              <PublicTitle
                title="18. Who can see your records"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                18.1 You agree that your sponsor, and the people it authorises,
                may see your training records made within its programme,
                including your enrolments, attempts, scores, results and
                certificates, but not the answers you gave to individual
                questions, and may use them for the purposes of training,
                assessing, accrediting and supervising you. When you pass a
                module, we email a copy of your certificate once, automatically,
                to the person your sponsor names, such as its clinical lead.
                This is what the programme is for, and your sponsor&apos;s own
                rules say more about it.
              </PublicBodyText>
              <PublicBodyText>
                18.2 Your sponsor may pass your records on, for example to your
                employer, a deanery or a professional body, under its own rules
                and its own privacy notice. We do not pass your records to
                anyone except your sponsor and the people it authorises, unless
                the law requires it.
              </PublicBodyText>
              <PublicTitle
                title="19. Help, requests and complaints go to your sponsor first"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                19.1 Your sponsor supports you in using Quill Medical. Ask your
                sponsor first if you need help with your programme, want to
                change what you can do, or want to leave a programme. If
                something in Quill Medical itself is not working (i.e. the
                software), tell us directly using the <strong>Feedback</strong>{" "}
                feature in the app&apos;s menu bar, or at{" "}
                <Link href="mailto:info@quill-medical.com">
                  info@quill-medical.com
                </Link>
                .
              </PublicBodyText>
              <PublicBodyText>
                19.2 Requests about your personal data in your training records,
                such as a copy, a correction or a deletion, go to your sponsor,
                because it is the entity that decides this. We can help your
                sponsor answer your queries. Requests about the data we hold in
                our own right, such as your account security records and your
                choice about news and updates, come to us. Our privacy policy
                explains the split.
              </PublicBodyText>
              <PublicTitle
                title="20. Fees and marketing"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                20.1 You pay us nothing for the service your sponsor gives you.
                Your sponsor may have its own charges, and those are between you
                and your sponsor.
              </PublicBodyText>
              <PublicBodyText>
                20.2 Whether you receive news and updates from Quill Medical is
                your own choice, separate from your sponsor&apos;s programme. We
                ask you when you register, or when you set your first password
                if your account was made for you, and you can change your answer
                at any time in the Settings menu or with the link in any
                newsletter. Your answer stands when you leave your sponsor and
                when your account is closed: if you want news and updates, they
                carry on, and if you do not, none are sent.
              </PublicBodyText>
              <PublicTitle
                title="21. When you leave your sponsor or its agreement ends"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                21.1 If you leave your sponsor&apos;s programme, your sponsor
                keeps its copy of your training records for the period its
                agreement and its own retention rules set, and you keep access
                to your own account and to what you can download for as long as
                the account is open. Where a sponsor has given us a period after
                which its records about you are deleted, it is set out under
                that sponsor&apos;s name in clause 21.3. Records your sponsor
                owns, such as its assessment records, remain its records, and
                you may keep a copy of them.
              </PublicBodyText>
              <PublicBodyText>
                21.2 If your sponsor&apos;s agreement with us ends, we will
                return or delete the sponsor&apos;s records as it instructs,
                within the time its agreement sets. Before that happens we will
                give you the chance to download your certificates, and, where
                the sponsor agreement allows, to keep your account as a direct
                customer.
              </PublicBodyText>
              <PublicBodyText>
                21.3 Where a sponsor&apos;s arrangements differ from the rest of
                these terms, they are set out below under that sponsor&apos;s
                name. Everything else in these terms applies to every sponsor
                alike.
              </PublicBodyText>
              <PublicTitle
                title="East of England Endoscopy Training Academy"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                If the East of England Endoscopy Training Academy (EoEETA), at
                Norfolk and Norwich University Hospitals NHS Foundation Trust,
                gave you access:
              </PublicBodyText>
              <List
                items={[
                  <>
                    <strong>A pass lasts three years.</strong> The notice in
                    clause 10.1 that an assessment you passed is due to be
                    repeated is sent when that time is coming up.
                  </>,
                  <>
                    <strong>You can try again at once.</strong> If you do not
                    pass an assessment, you may take it again straight away.
                    There is no limit on attempts and no wait between them.
                  </>,
                  <>
                    <strong>Reminders.</strong> If you are enrolled on a module
                    and have not finished an attempt, the reminders in clause
                    10.1 come each week, up to six times.
                  </>,
                  <>
                    <strong>Your certificate</strong> is sent to you and to
                    EoEETA&apos;s clinical lead for the site you are located at.
                  </>,
                  <>
                    <strong>
                      Your training records are kept for three and a half years
                      after your account is closed or deactivated
                    </strong>
                    , and are then deleted, once a member of our staff has
                    checked them. Your account is kept for at least as long as
                    those records.
                  </>,
                ]}
              />
            </Section>
            <Section title="Part C: If you deal with us directly">
              <PublicTitle
                title="22. Who this part applies to"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                22.1 This part applies if you create an account with us without
                a sponsor, or if you buy a plan from us for yourself. If you are
                an organisation buying for other people, clause 29 applies
                instead of clauses 23 to 28.
              </PublicBodyText>
              <PublicBodyText>
                22.2 If you are an individual buying for your own education, you
                are a consumer and you have the rights the law gives consumers.
              </PublicBodyText>
              <PublicTitle
                title="23. Plans, ordering and prices"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                23.1 Some of Quill Medical is free to use. Where a plan has a
                price, we show the price, what it includes, how long it lasts,
                how it renews and how to end it before you order. We are not
                registered for VAT, so no VAT is added to our prices. If that
                changes, the price shown before you order will say whether VAT
                is included.
              </PublicBodyText>
              <PublicBodyText>
                23.2 Your order is accepted, and the contract for the plan is
                made, when we confirm it by email. If we cannot accept an order
                we will tell you and refund anything you have paid.
              </PublicBodyText>
              <PublicBodyText>
                23.3 We may change prices. A change does not affect a plan you
                have already paid for. Clause 26 says how we tell you before a
                renewal.
              </PublicBodyText>
              <PublicTitle
                title="24. Your right to change your mind"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                24.1 You have 14 days from the day we confirm your order to
                cancel it for any reason, under the Consumer Contracts
                (Information, Cancellation and Additional Charges) Regulations
                2013.
              </PublicBodyText>
              <PublicBodyText>
                24.2 Your plan starts as soon as we confirm your order. If you
                cancel within the 14 days, we will provide you with a full
                refund.
              </PublicBodyText>
              <PublicBodyText>
                24.3 To cancel, email{" "}
                <Link href="mailto:info@quill-medical.com">
                  info@quill-medical.com
                </Link>
                , or use the cancellation form at the end of these terms. You do
                not have to use the form.
              </PublicBodyText>
              <PublicBodyText>
                24.4 We refund by the method you paid with, within 14 days of
                your telling us.
              </PublicBodyText>
              <PublicTitle
                title="25. Refunds outside the 14 days"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                25.1 If something we supplied is faulty or not as described, you
                have the remedies the Consumer Rights Act 2015 gives you.
              </PublicBodyText>
              <PublicBodyText>
                25.2 If you have not used a plan at all, we will refund it in
                full on request within 30 days of purchase, as a matter of
                goodwill. This does not reduce your legal rights.
              </PublicBodyText>
              <PublicTitle
                title="26. Subscriptions, renewal, price changes and cancellation"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                26.1 A subscription renews at the end of each period unless you
                cancel it. We will remind you by email at least 28 days before
                an annual renewal, and at least 7 days before a monthly one,
                with the price that will apply.
              </PublicBodyText>
              <PublicBodyText>
                26.2 If the price is going to change at a renewal, we will tell
                you at least 30 days before the renewal, and you may cancel
                before it takes effect at no cost.
              </PublicBodyText>
              <PublicBodyText>
                26.3 You can cancel a subscription at any time, in one message
                to us or through your account settings, and it ends at the end
                of the period you have paid for. We do not charge a fee for
                cancelling.
              </PublicBodyText>
              <PublicBodyText>
                26.4 After a free trial converts to a paid plan, and after any
                renewal of a plan lasting 12 months or more, you have a fresh 14
                days in which to cancel for a refund of the new period, less an
                amount for any days used.
              </PublicBodyText>
              <PublicTitle title="27. Payment" size="sm" ta="left" c="white" />
              <PublicBodyText>
                27.1 Payments are taken by a payment processor, named on the
                order page before you pay, which handles your card details under
                its own terms and privacy policy. We never see or store your
                full card number.
              </PublicBodyText>
              <PublicBodyText>
                27.2 If a payment fails we will tell you and try again. If it
                still fails after 14 days we may suspend the paid parts of your
                plan until it is paid, and end the plan if it remains unpaid
                after a further 30 days.
              </PublicBodyText>
              <PublicTitle
                title="28. If your plan ends or lapses"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                28.1 When a paid plan ends, your account stays open and you keep
                access to your own training records and your certificates, and
                to the free parts of Quill Medical. Content that needs a paid
                plan is no longer available. Our privacy policy says how long we
                keep your data after an account stops being used.
              </PublicBodyText>
              <PublicTitle
                title="29. Organisations contracting directly"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                29.1 An organisation that buys Quill Medical for its own users
                signs a written agreement with us, with a data processing
                schedule, and becomes the sponsor of the user we subsequently
                give access to. That agreement governs the service, its fees,
                its service level, liability between the organisation and us,
                and how we handle personal data on the organisation&apos;s
                behalf.
              </PublicBodyText>
              <PublicBodyText>
                29.2 The users an organisation gives access to are sponsored
                users and <strong>Part B</strong> above applies to them.
              </PublicBodyText>
              <PublicTitle
                title="30. Your legal rights as a consumer"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                30.1 We are under a legal duty to supply digital content and
                services that match these terms. Nothing in these terms affects
                your legal rights.
              </PublicBodyText>
              <PublicTitle
                title="Cancellation form"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                To Bailey Medics Ltd, trading as Quill Medical, Brooklands
                Place, Unit 5, Brooklands Road, Sale, Cheshire, M33 3SD,{" "}
                <Link href="mailto:info@quill-medical.com">
                  info@quill-medical.com
                </Link>
                :
              </PublicBodyText>
              <PublicBodyText>
                I give notice that I cancel my contract for the following plan:
              </PublicBodyText>
              <List
                items={[
                  <>Plan:</>,
                  <>Ordered on:</>,
                  <>Name:</>,
                  <>Email address on the account:</>,
                  <>Date:</>,
                ]}
              />
            </Section>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
