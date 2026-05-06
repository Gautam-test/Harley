--
-- PostgreSQL database dump
--

\restrict sBVYZWOcV3qvDc8WQ1KqRydIl5F2VZyxT7UtirmQN9O0RLFTtigAjAnhQOCSnIS

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY "public"."TradeInLead" DROP CONSTRAINT IF EXISTS "TradeInLead_dealerId_fkey";
ALTER TABLE IF EXISTS ONLY "public"."Order" DROP CONSTRAINT IF EXISTS "Order_listingId_fkey";
ALTER TABLE IF EXISTS ONLY "public"."Order" DROP CONSTRAINT IF EXISTS "Order_dealerId_fkey";
ALTER TABLE IF EXISTS ONLY "public"."OrderEvent" DROP CONSTRAINT IF EXISTS "OrderEvent_orderId_fkey";
ALTER TABLE IF EXISTS ONLY "public"."Listing" DROP CONSTRAINT IF EXISTS "Listing_dealerId_fkey";
ALTER TABLE IF EXISTS ONLY "public"."GeneralLead" DROP CONSTRAINT IF EXISTS "GeneralLead_dealerId_fkey";
ALTER TABLE IF EXISTS ONLY "public"."Enquiry" DROP CONSTRAINT IF EXISTS "Enquiry_listingId_fkey";
ALTER TABLE IF EXISTS ONLY "public"."Enquiry" DROP CONSTRAINT IF EXISTS "Enquiry_dealerId_fkey";
ALTER TABLE IF EXISTS ONLY "public"."AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorId_fkey";
DROP INDEX IF EXISTS "public"."TradeInLead_dealerId_status_idx";
DROP INDEX IF EXISTS "public"."TradeInLead_createdAt_idx";
DROP INDEX IF EXISTS "public"."StaticContent_key_key";
DROP INDEX IF EXISTS "public"."OtpVerification_phone_createdAt_idx";
DROP INDEX IF EXISTS "public"."Order_status_idx";
DROP INDEX IF EXISTS "public"."Order_orderId_key";
DROP INDEX IF EXISTS "public"."Order_dealerId_idx";
DROP INDEX IF EXISTS "public"."OrderEvent_orderId_occurredAt_idx";
DROP INDEX IF EXISTS "public"."Listing_year_idx";
DROP INDEX IF EXISTS "public"."Listing_vin_key";
DROP INDEX IF EXISTS "public"."Listing_status_idx";
DROP INDEX IF EXISTS "public"."Listing_slug_key";
DROP INDEX IF EXISTS "public"."Listing_price_idx";
DROP INDEX IF EXISTS "public"."Listing_modelFamily_modelName_idx";
DROP INDEX IF EXISTS "public"."LeadComment_leadKind_leadId_idx";
DROP INDEX IF EXISTS "public"."GeneralLead_dealerId_status_idx";
DROP INDEX IF EXISTS "public"."GeneralLead_createdAt_idx";
DROP INDEX IF EXISTS "public"."Enquiry_dealerId_status_idx";
DROP INDEX IF EXISTS "public"."Enquiry_createdAt_idx";
DROP INDEX IF EXISTS "public"."Dealer_username_key";
DROP INDEX IF EXISTS "public"."Dealer_torqueDealerId_key";
DROP INDEX IF EXISTS "public"."AuditLog_entityType_entityId_idx";
DROP INDEX IF EXISTS "public"."AuditLog_createdAt_idx";
DROP INDEX IF EXISTS "public"."AuditLog_actorId_idx";
DROP INDEX IF EXISTS "public"."AdminUser_email_key";
ALTER TABLE IF EXISTS ONLY "public"."_prisma_migrations" DROP CONSTRAINT IF EXISTS "_prisma_migrations_pkey";
ALTER TABLE IF EXISTS ONLY "public"."TradeInLead" DROP CONSTRAINT IF EXISTS "TradeInLead_pkey";
ALTER TABLE IF EXISTS ONLY "public"."StaticContent" DROP CONSTRAINT IF EXISTS "StaticContent_pkey";
ALTER TABLE IF EXISTS ONLY "public"."OtpVerification" DROP CONSTRAINT IF EXISTS "OtpVerification_pkey";
ALTER TABLE IF EXISTS ONLY "public"."Order" DROP CONSTRAINT IF EXISTS "Order_pkey";
ALTER TABLE IF EXISTS ONLY "public"."OrderEvent" DROP CONSTRAINT IF EXISTS "OrderEvent_pkey";
ALTER TABLE IF EXISTS ONLY "public"."Listing" DROP CONSTRAINT IF EXISTS "Listing_pkey";
ALTER TABLE IF EXISTS ONLY "public"."LeadComment" DROP CONSTRAINT IF EXISTS "LeadComment_pkey";
ALTER TABLE IF EXISTS ONLY "public"."GeneralLead" DROP CONSTRAINT IF EXISTS "GeneralLead_pkey";
ALTER TABLE IF EXISTS ONLY "public"."Enquiry" DROP CONSTRAINT IF EXISTS "Enquiry_pkey";
ALTER TABLE IF EXISTS ONLY "public"."Dealer" DROP CONSTRAINT IF EXISTS "Dealer_pkey";
ALTER TABLE IF EXISTS ONLY "public"."AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_pkey";
ALTER TABLE IF EXISTS ONLY "public"."AdminUser" DROP CONSTRAINT IF EXISTS "AdminUser_pkey";
DROP TABLE IF EXISTS "public"."_prisma_migrations";
DROP TABLE IF EXISTS "public"."TradeInLead";
DROP TABLE IF EXISTS "public"."StaticContent";
DROP TABLE IF EXISTS "public"."OtpVerification";
DROP TABLE IF EXISTS "public"."OrderEvent";
DROP TABLE IF EXISTS "public"."Order";
DROP TABLE IF EXISTS "public"."Listing";
DROP TABLE IF EXISTS "public"."LeadComment";
DROP TABLE IF EXISTS "public"."GeneralLead";
DROP TABLE IF EXISTS "public"."Enquiry";
DROP TABLE IF EXISTS "public"."Dealer";
DROP TABLE IF EXISTS "public"."AuditLog";
DROP TABLE IF EXISTS "public"."AdminUser";
DROP TYPE IF EXISTS "public"."OtpPurpose";
DROP TYPE IF EXISTS "public"."OrderStatus";
DROP TYPE IF EXISTS "public"."ListingStatus";
DROP TYPE IF EXISTS "public"."LeadStatus";
DROP TYPE IF EXISTS "public"."DealerStatus";
DROP TYPE IF EXISTS "public"."CertStatus";
--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: CertStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."CertStatus" AS ENUM (
    'CPO',
    'AS_IS'
);


--
-- Name: DealerStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."DealerStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED'
);


--
-- Name: LeadStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."LeadStatus" AS ENUM (
    'NEW',
    'CONTACTED',
    'IN_PROGRESS',
    'CONVERTED',
    'LOST',
    'CLOSED',
    'ON_SITE_VISIT',
    'LOAN_APPROVAL',
    'SUCCESS',
    'DEAD'
);


--
-- Name: ListingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."ListingStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'SOLD',
    'REMOVED',
    'DEACTIVATED'
);


--
-- Name: OrderStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."OrderStatus" AS ENUM (
    'ORDER_CONFIRMED',
    'QUALITY_INSPECTION',
    'DOCUMENTATION',
    'IN_TRANSIT',
    'READY_FOR_DELIVERY',
    'DELIVERED'
);


--
-- Name: OtpPurpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."OtpPurpose" AS ENUM (
    'ENQUIRY',
    'GENERAL_LEAD',
    'TRADE_IN'
);


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: AdminUser; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."AdminUser" (
    "id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "passwordHash" "text" NOT NULL,
    "name" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."AuditLog" (
    "id" "text" NOT NULL,
    "actorId" "text",
    "actorRole" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entityType" "text",
    "entityId" "text",
    "metadata" "jsonb",
    "ipAddress" "text",
    "userAgent" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Dealer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Dealer" (
    "id" "text" NOT NULL,
    "username" "text" NOT NULL,
    "passwordHash" "text" NOT NULL,
    "name" "text" NOT NULL,
    "legalName" "text",
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "address" "text",
    "city" "text" NOT NULL,
    "state" "text",
    "pincode" "text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "torqueDealerId" "text",
    "status" "public"."DealerStatus" DEFAULT 'ACTIVE'::"public"."DealerStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Enquiry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Enquiry" (
    "id" "text" NOT NULL,
    "listingId" "text" NOT NULL,
    "dealerId" "text" NOT NULL,
    "name" "text" NOT NULL,
    "phoneEnc" "text" NOT NULL,
    "emailEnc" "text" NOT NULL,
    "city" "text",
    "pincode" "text",
    "message" "text",
    "status" "public"."LeadStatus" DEFAULT 'NEW'::"public"."LeadStatus" NOT NULL,
    "notes" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: GeneralLead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."GeneralLead" (
    "id" "text" NOT NULL,
    "dealerId" "text" NOT NULL,
    "name" "text" NOT NULL,
    "phoneEnc" "text" NOT NULL,
    "emailEnc" "text" NOT NULL,
    "city" "text",
    "pincode" "text",
    "modelInterest" "text",
    "priceRange" "text",
    "status" "public"."LeadStatus" DEFAULT 'NEW'::"public"."LeadStatus" NOT NULL,
    "notes" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: LeadComment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."LeadComment" (
    "id" "text" NOT NULL,
    "leadKind" "text" NOT NULL,
    "leadId" "text" NOT NULL,
    "authorId" "text" NOT NULL,
    "authorRole" "text" NOT NULL,
    "authorName" "text" NOT NULL,
    "body" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Listing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Listing" (
    "id" "text" NOT NULL,
    "vin" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "dealerId" "text" NOT NULL,
    "modelFamily" "text" NOT NULL,
    "modelName" "text" NOT NULL,
    "year" integer NOT NULL,
    "colour" "text" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "kmsDriven" integer NOT NULL,
    "description" "text" NOT NULL,
    "images" "text"[],
    "certificationStatus" "public"."CertStatus" NOT NULL,
    "inspectionReportUrl" "text",
    "cpoDocs" "jsonb",
    "status" "public"."ListingStatus" DEFAULT 'DRAFT'::"public"."ListingStatus" NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    "soldAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "adminFeedback" "text",
    "owners" integer
);


--
-- Name: Order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Order" (
    "id" "text" NOT NULL,
    "orderId" "text" NOT NULL,
    "buyerName" "text" NOT NULL,
    "buyerPhoneEnc" "text" NOT NULL,
    "buyerEmailEnc" "text" NOT NULL,
    "listingId" "text",
    "bikeLabel" "text" NOT NULL,
    "dealerId" "text" NOT NULL,
    "status" "public"."OrderStatus" DEFAULT 'ORDER_CONFIRMED'::"public"."OrderStatus" NOT NULL,
    "estimatedDelivery" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: OrderEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."OrderEvent" (
    "id" "text" NOT NULL,
    "orderId" "text" NOT NULL,
    "status" "public"."OrderStatus" NOT NULL,
    "occurredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "note" "text"
);


--
-- Name: OtpVerification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."OtpVerification" (
    "id" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "purpose" "public"."OtpPurpose" NOT NULL,
    "codeHash" "text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: StaticContent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."StaticContent" (
    "id" "text" NOT NULL,
    "key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "bodyHtml" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: TradeInLead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."TradeInLead" (
    "id" "text" NOT NULL,
    "dealerId" "text" NOT NULL,
    "username" "text" NOT NULL,
    "bikeModel" "text" NOT NULL,
    "vin" "text" NOT NULL,
    "phoneEnc" "text" NOT NULL,
    "emailEnc" "text" NOT NULL,
    "city" "text" NOT NULL,
    "status" "public"."LeadStatus" DEFAULT 'NEW'::"public"."LeadStatus" NOT NULL,
    "notes" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."_prisma_migrations" (
    "id" character varying(36) NOT NULL,
    "checksum" character varying(64) NOT NULL,
    "finished_at" timestamp with time zone,
    "migration_name" character varying(255) NOT NULL,
    "logs" "text",
    "rolled_back_at" timestamp with time zone,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_steps_count" integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: AdminUser; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."AdminUser" ("id", "email", "passwordHash", "name", "createdAt", "updatedAt") FROM stdin;
cmol1kcsz0000112jx97utpef	admin@hd-cpo.local	$2a$12$I9fneC06LM3MFd0USc9Q4.U2PrPjjnh3ahxMo79Pbv22ZsrgFqGu.	H-D Admin	2026-04-30 05:26:45.203	2026-04-30 05:26:45.203
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."AuditLog" ("id", "actorId", "actorRole", "action", "entityType", "entityId", "metadata", "ipAddress", "userAgent", "createdAt") FROM stdin;
cmol2atfu0004zpljvo32y2q7	cmol1kcsz0000112jx97utpef	ADMIN	CONTENT_CREATED	StaticContent	cmol2atfn0002zpljgcmjoxwi	{"key": "faq", "version": 1}	::1	curl/8.19.0	2026-04-30 05:47:19.818
cmossea590008i27cankoypb2	cmol1kcsz0000112jx97utpef	ADMIN	LISTING_PUBLISHED	Listing	cmossczpp0006i27cy81nznfd	{"vin": "1HD1KHM18MB990001", "dealerId": "cmol1kd5b0001112jsauiid0d"}	::1	curl/8.19.0	2026-05-05 15:32:14.685
cmothljqf00087bgb0u0lcvw2	cmol1kcsz0000112jx97utpef	ADMIN	LISTING_RETURNED_TO_DEALER	Listing	cmosuq0i100019tb2cmdzx5am	{"dealerId": "cmol1kd5b0001112jsauiid0d", "feedback": "Smoke test feedback - photos need re-shooting"}	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8328	2026-05-06 03:17:44.103
cmotlygcm0003r0e53qgh89u9	cmol1kcsz0000112jx97utpef	ADMIN	LISTING_PUBLISHED	Listing	cmotlyfv80001r0e5cbj31hpb	{"vin": "1HD1KB417MB990001", "dealerId": "cmol1kd5b0001112jsauiid0d"}	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8328	2026-05-06 05:19:44.71
cmotmepew0003l3tedfoepgej	cmol1kcsz0000112jx97utpef	ADMIN	LISTING_PUBLISHED	Listing	cmotmeok50001l3teqyb3xqqr	{"vin": "1HD1KB417TB330001", "dealerId": "cmol1kd5b0001112jsauiid0d"}	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8328	2026-05-06 05:32:22.952
cmotovble0003eq5y9c1al4o3	cmol1kcsz0000112jx97utpef	ADMIN	LISTING_PUBLISHED	Listing	cmotokv7v0001eq5yl7kjs8zj	{"vin": "1HD1KB417MB770001", "dealerId": "cmol1kd5b0001112jsauiid0d"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0	2026-05-06 06:41:17.427
cmoty5kzh00075z98fpxiuhqk	cmol1kcsz0000112jx97utpef	ADMIN	LISTING_PUBLISHED	Listing	cmoty4ukj00035z98m2bafw9w	{"vin": "1HD1KEM18MBX00001", "dealerId": "cmol1kd5b0001112jsauiid0d"}	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0	2026-05-06 11:01:12.701
\.


--
-- Data for Name: Dealer; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."Dealer" ("id", "username", "passwordHash", "name", "legalName", "email", "phone", "address", "city", "state", "pincode", "latitude", "longitude", "torqueDealerId", "status", "createdAt", "updatedAt") FROM stdin;
cmol1kd5b0001112jsauiid0d	gurgaon-hd	$2a$12$gsi40vXI8b3DAN/7uZ7k3ujp7WqwviYgNhlEnEQGp2i3gMWAt2sbe	Capital Harley-Davidson Gurgaon	Capital Motorcycles Pvt Ltd	sales@capital-hd.example.in	+911244567890	Plot 12, Sector 14	Gurgaon	Haryana	122001	28.4595	77.0266	TQ-DEALER-0001	ACTIVE	2026-04-30 05:26:45.646	2026-04-30 05:26:45.646
cmol40eun0002r8pe0sbd12e0	mumbai-hd	$2a$12$Ragr1OPUv9puZeDd7DbIp.IXxLKzs.6j935iFDATC0VOtUZQWjyqy	Seven Islands Harley-Davidson Mumbai	Seven Islands Motorcycles Pvt Ltd	sales@7islands-hd.example.in	+912242233344	Linking Road, Bandra West	Mumbai	Maharashtra	400050	19.0596	72.8295	TQ-DEALER-0002	ACTIVE	2026-04-30 06:35:13.584	2026-04-30 06:35:13.584
cmotujmuz0000gzecdmekolcm	bengaluru-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Indi-an Harley-Davidson Bengaluru	Indi-an Motorcycles Pvt Ltd	sales@bengaluru-hd.example.in	+918041234567	14 Residency Road	Bengaluru	Karnataka	560025	12.9716	77.5946	TQ-DEALER-0003	ACTIVE	2026-05-06 09:20:09.851	2026-05-06 09:20:09.851
cmotujn5j0009gzeclsvddw1d	hyderabad-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Pegasus Harley-Davidson Hyderabad	Pegasus Motorcycles Pvt Ltd	sales@hyderabad-hd.example.in	+914023453456	Jubilee Hills Road No 36	Hyderabad	Telangana	500033	17.385	78.4867	TQ-DEALER-0004	ACTIVE	2026-05-06 09:20:10.232	2026-05-06 09:20:10.232
cmotujn5v000ggzecs9hl56yx	chennai-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Coastal Harley-Davidson Chennai	Coastal Motorcycles Pvt Ltd	sales@chennai-hd.example.in	+914428345678	Mount Road, Anna Salai	Chennai	Tamil Nadu	600002	13.0827	80.2707	TQ-DEALER-0005	ACTIVE	2026-05-06 09:20:10.243	2026-05-06 09:20:10.243
cmotujn6m000pgzecsygu4t08	pune-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Seven Islands Harley-Davidson Pune	Seven Islands Motorcycles Pvt Ltd	sales@pune-hd.example.in	+912026123344	Senapati Bapat Road	Pune	Maharashtra	411016	18.5204	73.8567	TQ-DEALER-0006	ACTIVE	2026-05-06 09:20:10.27	2026-05-06 09:20:10.27
cmotujn6v000wgzecosjwn6m6	kolkata-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Eastern Harley-Davidson Kolkata	Eastern Motorcycles Pvt Ltd	sales@kolkata-hd.example.in	+913340234567	Park Street	Kolkata	West Bengal	700016	22.5726	88.3639	TQ-DEALER-0007	ACTIVE	2026-05-06 09:20:10.279	2026-05-06 09:20:10.279
cmotujn770015gzec004vi8nw	chandigarh-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Northern Trails Harley-Davidson Chandigarh	Northern Trails Motorcycles Pvt Ltd	sales@chandigarh-hd.example.in	+911724567890	Sector 17-C	Chandigarh	Chandigarh	160017	30.7333	76.7794	TQ-DEALER-0008	ACTIVE	2026-05-06 09:20:10.292	2026-05-06 09:20:10.292
cmotujn8n001cgzecbnfm762d	ahmedabad-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Sterling Harley-Davidson Ahmedabad	Sterling Motorcycles Pvt Ltd	sales@ahmedabad-hd.example.in	+917940345678	SG Highway	Ahmedabad	Gujarat	380015	23.0225	72.5714	TQ-DEALER-0009	ACTIVE	2026-05-06 09:20:10.344	2026-05-06 09:20:10.344
cmotujn9q001lgzec0chhmgbl	jaipur-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Pink City Harley-Davidson Jaipur	Pink City Motorcycles Pvt Ltd	sales@jaipur-hd.example.in	+911412345678	Tonk Road, Jaipur	Jaipur	Rajasthan	302015	26.9124	75.7873	TQ-DEALER-0010	ACTIVE	2026-05-06 09:20:10.382	2026-05-06 09:20:10.382
cmotujn9w001sgzecuqfm9zmw	lucknow-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Awadh Harley-Davidson Lucknow	Awadh Motorcycles Pvt Ltd	sales@lucknow-hd.example.in	+915222345678	Hazratganj	Lucknow	Uttar Pradesh	226001	26.8467	80.9462	TQ-DEALER-0011	ACTIVE	2026-05-06 09:20:10.389	2026-05-06 09:20:10.389
cmotujna70021gzeci1aypiaw	indore-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Heart of India Harley-Davidson Indore	Heart of India Motorcycles Pvt Ltd	sales@indore-hd.example.in	+917312345678	AB Road	Indore	Madhya Pradesh	452001	22.7196	75.8577	TQ-DEALER-0012	ACTIVE	2026-05-06 09:20:10.399	2026-05-06 09:20:10.399
cmotujnay0028gzecp1y8ta9k	kochi-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Backwaters Harley-Davidson Kochi	Backwaters Motorcycles Pvt Ltd	sales@kochi-hd.example.in	+914843456789	MG Road, Kochi	Kochi	Kerala	682035	9.9312	76.2673	TQ-DEALER-0013	ACTIVE	2026-05-06 09:20:10.427	2026-05-06 09:20:10.427
cmotujnb8002hgzeceew1iix7	goa-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Coastline Harley-Davidson Goa	Coastline Motorcycles Pvt Ltd	sales@goa-hd.example.in	+918322345678	Panaji-Margao Highway	Panaji	Goa	403001	15.4909	73.8278	TQ-DEALER-0014	ACTIVE	2026-05-06 09:20:10.437	2026-05-06 09:20:10.437
cmotujnbh002ogzeca63wc49g	dehradun-hd	$2a$12$ZhLrWbA22mRdN2jnWEGaZuglkR0Xkz4g9I3zyIsmkdWjhauB1xhtO	Doon Valley Harley-Davidson Dehradun	Doon Valley Motorcycles Pvt Ltd	sales@dehradun-hd.example.in	+911352345678	Rajpur Road	Dehradun	Uttarakhand	248001	30.3165	78.0322	TQ-DEALER-0015	ACTIVE	2026-05-06 09:20:10.445	2026-05-06 09:20:10.445
\.


--
-- Data for Name: Enquiry; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."Enquiry" ("id", "listingId", "dealerId", "name", "phoneEnc", "emailEnc", "city", "pincode", "message", "status", "notes", "createdAt", "updatedAt") FROM stdin;
cmol293ah0001zpljm8dsi3ob	cmol1kd5y0003112j5cdrh63c	cmol1kd5b0001112jsauiid0d	Smoke Tester	v1:PI+UEY2vse7XNum6.YlxCScz7x6XRChKY52N6lQ==.FnT4ius1Lt2YKfjkcg==	v1:kkFKx408070U0lVH.vbeskdpLfe654cFogpZ0gQ==.c0Y2YHBmVzuwGtd4wCg=	Mumbai	400001	Interested, please contact	NEW	\N	2026-04-30 05:45:59.269	2026-04-30 05:45:59.269
cmoss9mmt0001i27ck5sqv4kx	cmol40ewr000kr8pe1ykaixmp	cmol1kd5b0001112jsauiid0d	Test Buyer	v1:2cyXSipv4FUH8hLy.2IPm4OOqX4x5mQubF6RQTQ==.Z05tc5O6qgVHBa2AWA==	v1:KfQzeWADwpCEcVCt.z/6y2WrhcNGFUT0FY7PBXA==.dYeRN+J78Q1gPtcw	Gurgaon	122001	E2E listing enquiry	ON_SITE_VISIT	\N	2026-05-05 15:28:37.586	2026-05-05 15:29:20.593
cmosuw69300039tb27zf0t6j8	cmol40ewr000kr8pe1ykaixmp	cmol1kd5b0001112jsauiid0d	Sidebar Test	v1:TXUZXcoO4LHcTtue./Af0ITzp4/euDv0Qd7gJ3g==.4kd02F6VwMcaTzEh5w==	v1:5jngHK6x+Lzf3UBr.JXUgQcBNiKZhzT5EiPjSpA==./wv1EL7XJFEm	\N	\N	Sidebar card flow	NEW	\N	2026-05-05 16:42:08.679	2026-05-05 16:42:08.679
cmothkcgf00017bgbf2p4d041	cmosup2ga0001wjj1rclho10e	cmol1kd5b0001112jsauiid0d	Regression Tester	v1:p0STR4lgLIk7c6jq.BInVGIKRTRxnrAOkz3EiAA==.fEvAF41xrDPZlzKNfw==	v1:S0o+j6BvqqQIIxMR.mIHiQceeIh4ave1O1F+t3g==.gCQ++U/WOsAMA1OZOhnWjinuXgd1	Gurgaon	122001	Smoke test enquiry	ON_SITE_VISIT	\N	2026-05-06 03:16:48.012	2026-05-06 03:16:49.42
cmotjixii0001q4uw0k013oq3	cmosup2ga0001wjj1rclho10e	cmol1kd5b0001112jsauiid0d	Gautam nagpal	v1:8OLzm5Ztyx6ich8p.3fs0FMqsi27ysLU3BdjB2w==.L7wZbaMRKJzOLNiezw==	v1:Suc7Ta0WGFFBg1v/.if5lMKH5Rpsva+kt1emkcA==.uv81nttoNeAqOQtzf4I61SSr0V9Q58l62JsT	Hero Parts	112211	asdasd\nLooking for: asdsda\nState: Hero Parts	NEW	\N	2026-05-06 04:11:41.187	2026-05-06 04:11:41.187
cmotl8jbo0003q4uw4pjzz36v	cmosup2ga0001wjj1rclho10e	cmol1kd5b0001112jsauiid0d	Gautam nagpal	v1:FgsBSoN4VBr2o3Bm.RMCptLgG472Y5s6Nu/wQmw==.B33tJM61I/8U0ivf2Q==	v1:1nDvIA5FlDZVkSAH.s6LPAudig/WIc1musmQISQ==.q4LvpL5C8aiZQ7059058pdTE1LgqYLbJ5uRb	Gurgaon	122001	Test\nLooking for: Sportster S\nState: Haryana	ON_SITE_VISIT	\N	2026-05-06 04:59:35.508	2026-05-06 07:14:18.823
cmotxrdh8000p7fb8xuho8dcc	cmotujnbq002wgzecjn8pu3u5	cmotujnbh002ogzeca63wc49g	Gautam nagpal	v1:8aRRI1Pqg57syAbe.k3yy+0psHJMDzr2A2Y/1nQ==.4NCDY9lIwazYQELFvA==	v1:J4Mgm2SwZkn29GnA.3HzjruYF5kg7la3q5u1L+Q==.B7+xGIf9X1J99elmTaf8Yx2OdBi19tmyDD6W	Faridabad	111111	ascbahsv kjasbvkjabsfk\nLooking for: Iron 1200\nState: Haryana	NEW	\N	2026-05-06 10:50:09.78	2026-05-06 10:50:09.78
cmotyz69d0001mp2d5hbjl8wl	cmoty4ukj00035z98m2bafw9w	cmol1kd5b0001112jsauiid0d	Walk-in Test	v1:JlUXzCsQE7OIFKog.lnH2ZIoC3idAsNWtMRwtZw==.TPFWr+KHjvdBPNgStQ==	v1:GGjy752+Gq2572ek.XdGN8KTCT7BdlIrHc4LuYQ==.bmmCA/2svaN4GzanH7cp	Gurgaon	\N	Walked in 11 AM	NEW	\N	2026-05-06 11:24:13.297	2026-05-06 11:24:13.297
\.


--
-- Data for Name: GeneralLead; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."GeneralLead" ("id", "dealerId", "name", "phoneEnc", "emailEnc", "city", "pincode", "modelInterest", "priceRange", "status", "notes", "createdAt", "updatedAt") FROM stdin;
cmothlh6m00067bgbjejnibta	cmol1kd5b0001112jsauiid0d	Lookie Loo	v1:MR+RNpMPwlJlMKH6.anbJVLW/ts7iCkR03Gv/1Q==.W92ApU6UVPCRu6L5eg==	v1:5ezi7pMVgZ8TSDz0.BbQhwAnuoWc0bgvVsr0Oyg==.uHupzq14A03MxEtU4pHik+Jq	Gurgaon	\N	Fat Boy 114	15-20L	NEW	\N	2026-05-06 03:17:40.799	2026-05-06 03:17:40.799
\.


--
-- Data for Name: LeadComment; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."LeadComment" ("id", "leadKind", "leadId", "authorId", "authorRole", "authorName", "body", "createdAt") FROM stdin;
cmossajw80004i27c9vmm2uce	buyer	cmoss9mmt0001i27ck5sqv4kx	cmol1kd5b0001112jsauiid0d	DEALER	Capital Harley-Davidson Gurgaon	Buyer scheduled for showroom visit Friday 4pm.	2026-05-05 15:29:20.696
cmothkdlz00027bgbdmefme14	buyer	cmothkcgf00017bgbf2p4d041	cmol1kd5b0001112jsauiid0d	DEALER	Capital Harley-Davidson Gurgaon	Smoke test comment - scheduling test ride	2026-05-06 03:16:49.511
cmotxxidy00005z988l8i2gsa	trade-in	cmotrubdd00037fb8z7nrt0ug	cmol1kd5b0001112jsauiid0d	DEALER	Capital Harley-Davidson Gurgaon	dfghjkl	2026-05-06 10:54:56.086
cmotxy8dn00015z98op2nvjof	trade-in	cmotrubdd00037fb8z7nrt0ug	cmol1kd5b0001112jsauiid0d	DEALER	Capital Harley-Davidson Gurgaon	bt nhi ho paai	2026-05-06 10:55:29.771
\.


--
-- Data for Name: Listing; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."Listing" ("id", "vin", "slug", "dealerId", "modelFamily", "modelName", "year", "colour", "price", "kmsDriven", "description", "images", "certificationStatus", "inspectionReportUrl", "cpoDocs", "status", "publishedAt", "soldAt", "createdAt", "updatedAt", "adminFeedback", "owners") FROM stdin;
cmol40ewl000er8pel95c4ms7	1HD1FXX11PB334455	2023-heritage-classic-114-334455	cmol1kd5b0001112jsauiid0d	Cruiser	Heritage Classic 114	2023	Vivid Black	2150000.00	9200	Soft tail Heritage Classic with the 114 engine and leather-trim saddlebags. Whitewall tyres, chrome fender accents, classic floorboards. A true cruiser for long Sunday rides.	{https://images.medialinksonline.com/8225108x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374924x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779193x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 13:15:34.407	\N	2026-04-30 06:35:13.653	2026-05-05 13:15:34.408	\N	\N
cmol40ew50008r8pew6slue03	1HD1KEM13PB445566	2023-road-king-special-445566	cmol1kd5b0001112jsauiid0d	Grand American Touring	Road King Special	2023	Black Denim	2475000.00	12500	Stripped-back tourer with attitude. Mini-ape handlebars, blacked-out powertrain, hard saddlebags, and the M-8 114 doing the talking. Adult-owned, regularly serviced at the authorised dealer. Includes Harley-Davidson Genuine premium grips upgrade.	{https://images.medialinksonline.com/8825087x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8830705x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 13:15:34.401	\N	2026-04-30 06:35:13.637	2026-05-05 13:15:34.402	\N	\N
cmol40ew7000ar8pe8cq5vlec	1HD1RA1A5RB778899	2024-pan-america-1250s-778899	cmol1kd5b0001112jsauiid0d	Adventure Touring	Pan America 1250 Special	2024	Pearl White	2295000.00	5600	Adventure-ready Pan America 1250 Special with Adaptive Ride Height, semi-active suspension, and 150 hp Revolution Max powertrain. Crash bars, hand guards, and Givi top case included. Fully on-road documented.	{https://images.medialinksonline.com/8825071x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8613849x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 13:15:34.403	\N	2026-04-30 06:35:13.639	2026-05-05 13:15:34.405	\N	\N
cmol40ewn000gr8pet1y2c9rx	1HD1FBM18MB667788	2024-low-rider-s-667788	cmol1kd5b0001112jsauiid0d	Cruiser	Low Rider S	2024	Vivid Black	1825000.00	2800	Performance cruiser. Milwaukee-Eight 117, mid-mount controls, drag-style bars, blacked-out finish. Less than 3,000 km — practically new.	{https://images.medialinksonline.com/8757963x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374925x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 13:15:34.41	\N	2026-04-30 06:35:13.656	2026-05-05 13:15:34.411	\N	\N
cmol40ewp000ir8pe1f2ghjgl	1HD1XL211NB998877	2022-iron-883-998877	cmol1kd5b0001112jsauiid0d	Sport	Iron 883	2022	Denim Black	950000.00	14300	The everyday iron-fist Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Excellent condition, second owner.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-05 13:15:34.413	\N	2026-04-30 06:35:13.658	2026-05-05 13:15:34.415	\N	\N
cmol40ewr000kr8pe1ykaixmp	1HD1FBR1XPB001122	2024-street-bob-114-001122	cmol1kd5b0001112jsauiid0d	Cruiser	Street Bob 114	2024	Redline Red	1495000.00	6700	Pure stripped-down soft-tail bobber attitude with the M-8 114. Mini-ape bars, single seat, fat front 19" wheel. Originally sold by us, now back for a second owner.	{https://images.medialinksonline.com/8825065x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 13:15:34.415	\N	2026-04-30 06:35:13.659	2026-05-05 13:15:34.416	\N	\N
cmossczpp0006i27cy81nznfd	1HD1KHM18MB990001	2024-road-glide-st-990001	cmol1kd5b0001112jsauiid0d	Grand American Touring	Road Glide ST	2024	Vivid Black	2350000.00	4800	Single owner, full service history. Stage-1 upgraded with screamin eagle exhaust. Comes with both keys, original toolkit, and HOG membership voucher.	{https://images.medialinksonline.com/8825026x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 15:32:14.669	\N	2026-05-05 15:31:14.509	2026-05-05 15:32:14.682	\N	\N
cmosup2ga0001wjj1rclho10e	1HD1KHM18MB770001	2024-heritage-classic-114-770001	cmol1kd5b0001112jsauiid0d	Cruiser	Heritage Classic 114	2024	Pearl White	1990000.00	2200	Auto-publish path verification � should appear in public search instantly.	{https://images.medialinksonline.com/8225108x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 16:36:37.156	\N	2026-05-05 16:36:37.162	2026-05-05 16:36:37.162	\N	\N
cmolb4sx80001d18scaw696z7	1HD1KHM18MB000001	2023-street-glide-special-000001	cmol1kd5b0001112jsauiid0d	Grand American Touring	Street Glide Special	2023	Vivid Black	11111.00	11	dsvsvdsvjsdnbvkjdbsvkjdbs	{dvsdvsv}	CPO	\N	\N	SOLD	2026-04-30 09:55:42.017	2026-04-30 09:55:45.469	2026-04-30 09:54:35.757	2026-04-30 09:55:45.47	\N	\N
cmol1kd5y0003112j5cdrh63c	1HD1KHM18MB678901	2023-street-glide-special-678901	cmol1kd5b0001112jsauiid0d	Grand American Touring	Street Glide Special	2023	Vivid Black	2895000.00	8400	A flagship grand American tourer in immaculate, single-owner condition. 110-point inspection complete. Milwaukee-Eight 114 engine, Boom! Box GTS infotainment, premium audio, batwing fairing. Always garaged, full service history attached.	{https://images.medialinksonline.com/8825026x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8822168x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8825056x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 13:15:34.367	\N	2026-04-30 05:26:45.669	2026-05-05 13:15:34.368	\N	\N
cmol40ew20006r8pej9ctphcq	1HD1FBV13NB512347	2024-fat-boy-114-512347	cmol1kd5b0001112jsauiid0d	Cruiser	Fat Boy 114	2024	Vivid Black	1950000.00	3200	The icon. 2024 Fat Boy 114 with the powerful Milwaukee-Eight 114, classic Lakester wheels, and that unmistakable solid-disc silhouette. Pristine original paint and chrome. Comes with original toolkit, both keys, and complete service records.	{https://images.medialinksonline.com/8822481x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779234x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7804764x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 13:15:34.399	\N	2026-04-30 06:35:13.635	2026-05-05 13:15:34.401	\N	\N
cmol40ewj000cr8ped0fvwso9	1HD1HX212NB223344	2024-sportster-s-223344	cmol1kd5b0001112jsauiid0d	Sport	Sportster S	2024	Industrial Yellow	1675000.00	4100	The all-new Sportster S — Revolution Max 1250T, ride modes, traction control, and aggressive bobber-style stance. Yellow on black. Single owner, dealer-maintained.	{https://images.medialinksonline.com/8825049x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-05 13:15:34.405	\N	2026-04-30 06:35:13.651	2026-05-05 13:15:34.406	\N	\N
cmosunays0001iuzopi19j7mk	1HD1KHM18MB880001	2024-heritage-classic-114-880001	cmol1kd5b0001112jsauiid0d	Cruiser	Heritage Classic 114	2024	Vivid Black	2050000.00	3100	Auto-publish test bike � should land ACTIVE not DRAFT.	{https://images.medialinksonline.com/8225108x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	DRAFT	\N	\N	2026-05-05 16:35:14.885	2026-05-05 16:35:14.885	\N	\N
cmosuq0i100019tb2cmdzx5am	1HD1KHM18MB660001	2023-heritage-classic-114-660001	cmol1kd5b0001112jsauiid0d	Cruiser	Heritage Classic 114	2023	Vivid Black	1850000.00	4400	Default-flag verification � should land DRAFT awaiting admin publish.	{https://images.medialinksonline.com/8225108x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	DRAFT	\N	\N	2026-05-05 16:37:21.29	2026-05-06 03:17:44.06	Smoke test feedback - photos need re-shooting	\N
cmotmxjbf0001uam1osiakqjl	1HD1KB417TB880001	2026-street-glide-special-880001	cmol1kd5b0001112jsauiid0d	Grand American Touring	Street Glide Special	2026	Vivid Black	1490000.00	12000	As-Is test - no inspection PDF, server should accept this since cert is AS_IS.	{/api/v1/uploads/listing-images/a.webp,/api/v1/uploads/listing-images/b.webp,/api/v1/uploads/listing-images/c.webp,/api/v1/uploads/listing-images/d.webp}	AS_IS	\N	\N	REMOVED	\N	\N	2026-05-06 05:47:01.515	2026-05-06 08:09:39.474	\N	2
cmotokv7v0001eq5yl7kjs8zj	1HD1KB417MB770001	2021-street-glide-special-770001	cmol1kd5b0001112jsauiid0d	Grand American Touring	Street Glide Special	2021	Vivid Black	121221212.00	1212	svnjdsvnkjnsdvnjkjdvns	{/api/v1/uploads/listing-images/0c85d062-6ab3-48fd-96f5-8c9b58a145cf.webp,/api/v1/uploads/listing-images/3ece4a52-dc56-4570-8559-06257a4237f8.webp,/api/v1/uploads/listing-images/5926a521-3ab9-4a94-8794-1fae86ca37f6.webp,/api/v1/uploads/listing-images/83824857-18a6-4189-8034-277f6b94d8de.webp}	CPO	/api/v1/inspection/files/39c9cdcd-1d6c-4530-8e57-49cfb29991e7.pdf	{"rcUrl": "https://torque.mock/rc/1HD1KB417MB770001.pdf", "espUrl": "https://torque.mock/esp/1HD1KB417MB770001.pdf", "hogUrl": "https://torque.mock/hog-membership/1HD1KB417MB770001.pdf", "rsaUrl": "https://torque.mock/rsa/1HD1KB417MB770001.pdf", "cpoCertUrl": "https://torque.mock/cpo-cert/1HD1KB417MB770001.pdf", "insuranceUrl": "https://torque.mock/insurance/1HD1KB417MB770001.pdf", "deliveryNoteUrl": "https://torque.mock/delivery-note/1HD1KB417MB770001.pdf", "serviceHistoryUrl": "https://torque.mock/service-history/1HD1KB417MB770001.pdf"}	REMOVED	2026-05-06 06:41:17.37	\N	2026-05-06 06:33:09.628	2026-05-06 08:09:41.303	\N	1
cmotmeok50001l3teqyb3xqqr	1HD1KB417TB330001	2026-street-glide-special-330001	cmol1kd5b0001112jsauiid0d	Grand American Touring	Street Glide Special	2026	Vivid Black	1990000.00	9500	Test - slim payload, server resolves model/family/colour from Torque against the VIN.	{/api/v1/uploads/listing-images/a.webp,/api/v1/uploads/listing-images/b.webp,/api/v1/uploads/listing-images/c.webp,/api/v1/uploads/listing-images/d.webp}	CPO	/api/v1/inspection/test.pdf	{"cpoCertUrl": "mock://test/cert.pdf"}	REMOVED	2026-05-06 05:32:22.938	\N	2026-05-06 05:32:21.842	2026-05-06 08:09:43.557	\N	2
cmotlyfv80001r0e5cbj31hpb	1HD1KB417MB990001	2023-street-glide-special-990001	cmol1kd5b0001112jsauiid0d	Grand American Touring	Street Glide Special	2023	Vivid Black	1890000.00	8240	Test listing - single-owner Street Glide Special with full service history.	{/api/v1/uploads/listing-images/test1.webp,/api/v1/uploads/listing-images/test2.webp,/api/v1/uploads/listing-images/test3.webp,/api/v1/uploads/listing-images/test4.webp}	CPO	/api/v1/inspection/test.pdf	{"cpoCertUrl": "mock://test/cert.pdf"}	REMOVED	2026-05-06 05:19:44.638	\N	2026-05-06 05:19:44.084	2026-05-06 08:09:44.527	\N	1
cmotujn6o000rgzecz3v1lznm	1HD1XL2110BX0006X	2021-iron-883-x0006x	cmotujn6m000pgzecsygu4t08	Sport	Iron 883	2021	Denim Black	895000.00	18400	Everyday Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Second owner, well-maintained.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.271	\N	2026-05-06 09:20:10.273	2026-05-06 09:20:10.273	\N	1
cmotujn6r000tgzecyiped7zz	1HD1FBR1X0BX0006X	2023-street-bob-114-x0006x	cmotujn6m000pgzecsygu4t08	Cruiser	Street Bob 114	2023	Redline Red	1450000.00	9700	Stripped-down soft-tail bobber with M-8 114. Mini-ape bars, single seat, 19" front. Originally sold by us.	{https://images.medialinksonline.com/8825065x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.273	\N	2026-05-06 09:20:10.275	2026-05-06 09:20:10.275	\N	2
cmotujn4x0002gzecee82zhih	1HD1RA1A50BX0003X	2024-pan-america-1250-special-x0003x	cmotujmuz0000gzecdmekolcm	Adventure Touring	Pan America 1250 Special	2024	Pearl White	2295000.00	5600	Adventure-ready Pan America 1250S with Adaptive Ride Height + 150 hp Revolution Max. Crash bars and top case included.	{https://images.medialinksonline.com/8825071x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8613849x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.204	\N	2026-05-06 09:20:10.21	2026-05-06 09:20:10.21	\N	1
cmotujn530004gzec7y6e4lgo	1HD1HX2120BX0003X	2023-sportster-s-x0003x	cmotujmuz0000gzecdmekolcm	Sport	Sportster S	2023	Industrial Yellow	1575000.00	7800	Revolution Max 1250T, ride modes, traction control, aggressive bobber stance. Yellow-on-black.	{https://images.medialinksonline.com/8825049x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.213	\N	2026-05-06 09:20:10.215	2026-05-06 09:20:10.215	\N	2
cmotujn5e0006gzechxfpvagk	1HD1FBM180BX0003X	2024-low-rider-s-x0003x	cmotujmuz0000gzecdmekolcm	Cruiser	Low Rider S	2024	Vivid Black	1825000.00	2800	Performance cruiser with Milwaukee-Eight 117, mid controls, drag bars, blacked-out finish. Practically new.	{https://images.medialinksonline.com/8757963x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374925x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.225	\N	2026-05-06 09:20:10.227	2026-05-06 09:20:10.227	\N	3
cmotujn5h0008gzectdd6p700	1HD1XL2110BX0003X	2021-iron-883-x0003x	cmotujmuz0000gzecdmekolcm	Sport	Iron 883	2021	Denim Black	895000.00	18400	Everyday Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Second owner, well-maintained.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.228	\N	2026-05-06 09:20:10.23	2026-05-06 09:20:10.23	\N	1
cmotujn5m000bgzec2ak12le8	1HD1HX2120BX0004X	2023-sportster-s-x0004x	cmotujn5j0009gzeclsvddw1d	Sport	Sportster S	2023	Industrial Yellow	1575000.00	7800	Revolution Max 1250T, ride modes, traction control, aggressive bobber stance. Yellow-on-black.	{https://images.medialinksonline.com/8825049x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.233	\N	2026-05-06 09:20:10.235	2026-05-06 09:20:10.235	\N	1
cmotujn5p000dgzecac4j35gb	1HD1FBM180BX0004X	2024-low-rider-s-x0004x	cmotujn5j0009gzeclsvddw1d	Cruiser	Low Rider S	2024	Vivid Black	1825000.00	2800	Performance cruiser with Milwaukee-Eight 117, mid controls, drag bars, blacked-out finish. Practically new.	{https://images.medialinksonline.com/8757963x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374925x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.236	\N	2026-05-06 09:20:10.238	2026-05-06 09:20:10.238	\N	2
cmotujn5t000fgzecuktpj9z2	1HD1XL2110BX0004X	2021-iron-883-x0004x	cmotujn5j0009gzeclsvddw1d	Sport	Iron 883	2021	Denim Black	895000.00	18400	Everyday Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Second owner, well-maintained.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.239	\N	2026-05-06 09:20:10.241	2026-05-06 09:20:10.241	\N	3
cmotujn6d000igzec9g3t5fm2	1HD1FBM180BX0005X	2024-low-rider-s-x0005x	cmotujn5v000ggzecs9hl56yx	Cruiser	Low Rider S	2024	Vivid Black	1825000.00	2800	Performance cruiser with Milwaukee-Eight 117, mid controls, drag bars, blacked-out finish. Practically new.	{https://images.medialinksonline.com/8757963x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374925x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.259	\N	2026-05-06 09:20:10.261	2026-05-06 09:20:10.261	\N	1
cmotujn6f000kgzeccne2o6oj	1HD1XL2110BX0005X	2021-iron-883-x0005x	cmotujn5v000ggzecs9hl56yx	Sport	Iron 883	2021	Denim Black	895000.00	18400	Everyday Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Second owner, well-maintained.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.262	\N	2026-05-06 09:20:10.264	2026-05-06 09:20:10.264	\N	2
cmotujn6i000mgzeclyu6wc4l	1HD1FBR1X0BX0005X	2023-street-bob-114-x0005x	cmotujn5v000ggzecs9hl56yx	Cruiser	Street Bob 114	2023	Redline Red	1450000.00	9700	Stripped-down soft-tail bobber with M-8 114. Mini-ape bars, single seat, 19" front. Originally sold by us.	{https://images.medialinksonline.com/8825065x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.264	\N	2026-05-06 09:20:10.266	2026-05-06 09:20:10.266	\N	3
cmotujn6k000ogzeckjs3trkx	1HD1KEM130BX0005X	2022-road-king-special-x0005x	cmotujn5v000ggzecs9hl56yx	Grand American Touring	Road King Special	2022	Vivid Black	2275000.00	16500	Stripped-back tourer with mini-ape handlebars, blacked-out powertrain, hard saddlebags. Authorised dealer service history.	{https://images.medialinksonline.com/8825087x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8830705x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.267	\N	2026-05-06 09:20:10.269	2026-05-06 09:20:10.269	\N	1
cmotujn6u000vgzecjidy4w6i	1HD1KEM130BX0006X	2022-road-king-special-x0006x	cmotujn6m000pgzecsygu4t08	Grand American Touring	Road King Special	2022	Vivid Black	2275000.00	16500	Stripped-back tourer with mini-ape handlebars, blacked-out powertrain, hard saddlebags. Authorised dealer service history.	{https://images.medialinksonline.com/8825087x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8830705x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.276	\N	2026-05-06 09:20:10.278	2026-05-06 09:20:10.278	\N	3
cmotujn6y000ygzecsltw1egm	1HD1FBR1X0BX0007X	2023-street-bob-114-x0007x	cmotujn6v000wgzecosjwn6m6	Cruiser	Street Bob 114	2023	Redline Red	1450000.00	9700	Stripped-down soft-tail bobber with M-8 114. Mini-ape bars, single seat, 19" front. Originally sold by us.	{https://images.medialinksonline.com/8825065x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.28	\N	2026-05-06 09:20:10.282	2026-05-06 09:20:10.282	\N	1
cmotujn700010gzecc6lbacje	1HD1KEM130BX0007X	2022-road-king-special-x0007x	cmotujn6v000wgzecosjwn6m6	Grand American Touring	Road King Special	2022	Vivid Black	2275000.00	16500	Stripped-back tourer with mini-ape handlebars, blacked-out powertrain, hard saddlebags. Authorised dealer service history.	{https://images.medialinksonline.com/8825087x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8830705x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.283	\N	2026-05-06 09:20:10.285	2026-05-06 09:20:10.285	\N	2
cmotujn730012gzecjk8cbilf	1HD1XL2990BX0007X	2019-iron-883-x0007x	cmotujn6v000wgzecosjwn6m6	Sport	Iron 883	2019	Vivid Black	695000.00	28100	Older but well-loved Iron 883. As-Is listing — sold without certification. Great budget entry into the H-D family.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.285	\N	2026-05-06 09:20:10.288	2026-05-06 09:20:10.288	\N	3
cmotujn760014gzeckoe1iwqx	1HD1KHM180BX0007X	2023-street-glide-special-x0007x	cmotujn6v000wgzecosjwn6m6	Grand American Touring	Street Glide Special	2023	Vivid Black	2895000.00	8400	Flagship grand American tourer in single-owner condition. Milwaukee-Eight 114, Boom! Box GTS, premium audio. 110-point inspection complete.	{https://images.medialinksonline.com/8825026x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8822168x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8825056x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.288	\N	2026-05-06 09:20:10.29	2026-05-06 09:20:10.29	\N	1
cmotujn7n0017gzecwtatuqvc	1HD1KEM130BX0008X	2022-road-king-special-x0008x	cmotujn770015gzec004vi8nw	Grand American Touring	Road King Special	2022	Vivid Black	2275000.00	16500	Stripped-back tourer with mini-ape handlebars, blacked-out powertrain, hard saddlebags. Authorised dealer service history.	{https://images.medialinksonline.com/8825087x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8830705x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.305	\N	2026-05-06 09:20:10.307	2026-05-06 09:20:10.307	\N	1
cmotujn820019gzec3q3mh70d	1HD1XL2990BX0008X	2019-iron-883-x0008x	cmotujn770015gzec004vi8nw	Sport	Iron 883	2019	Vivid Black	695000.00	28100	Older but well-loved Iron 883. As-Is listing — sold without certification. Great budget entry into the H-D family.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.321	\N	2026-05-06 09:20:10.323	2026-05-06 09:20:10.323	\N	2
cmotujn85001bgzecpww14qtu	1HD1KHM180BX0008X	2023-street-glide-special-x0008x	cmotujn770015gzec004vi8nw	Grand American Touring	Street Glide Special	2023	Vivid Black	2895000.00	8400	Flagship grand American tourer in single-owner condition. Milwaukee-Eight 114, Boom! Box GTS, premium audio. 110-point inspection complete.	{https://images.medialinksonline.com/8825026x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8822168x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8825056x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.324	\N	2026-05-06 09:20:10.326	2026-05-06 09:20:10.326	\N	3
cmotujn9i001egzecgjdlwx0l	1HD1XL2990BX0009X	2019-iron-883-x0009x	cmotujn8n001cgzecbnfm762d	Sport	Iron 883	2019	Vivid Black	695000.00	28100	Older but well-loved Iron 883. As-Is listing — sold without certification. Great budget entry into the H-D family.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.372	\N	2026-05-06 09:20:10.374	2026-05-06 09:20:10.374	\N	1
cmotujn9k001ggzecws83xrss	1HD1KHM180BX0009X	2023-street-glide-special-x0009x	cmotujn8n001cgzecbnfm762d	Grand American Touring	Street Glide Special	2023	Vivid Black	2895000.00	8400	Flagship grand American tourer in single-owner condition. Milwaukee-Eight 114, Boom! Box GTS, premium audio. 110-point inspection complete.	{https://images.medialinksonline.com/8825026x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8822168x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8825056x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.374	\N	2026-05-06 09:20:10.376	2026-05-06 09:20:10.376	\N	2
cmotujn9m001igzecge8lxqlb	1HD1FBV130BX0009X	2024-fat-boy-114-x0009x	cmotujn8n001cgzecbnfm762d	Cruiser	Fat Boy 114	2024	Vivid Black	1950000.00	3200	The icon. 2024 Fat Boy 114 with Milwaukee-Eight 114, Lakester wheels, original chrome. Both keys, full service records.	{https://images.medialinksonline.com/8822481x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779234x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7804764x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.377	\N	2026-05-06 09:20:10.379	2026-05-06 09:20:10.379	\N	3
cmotujn9o001kgzecjiu505qs	1HD1FXX110BX0009X	2022-heritage-classic-114-x0009x	cmotujn8n001cgzecbnfm762d	Cruiser	Heritage Classic 114	2022	Black Denim	1850000.00	14200	Soft tail Heritage Classic with leather saddlebags, whitewall tyres, classic floorboards. Perfect Sunday cruiser.	{https://images.medialinksonline.com/8225108x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374924x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779193x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.379	\N	2026-05-06 09:20:10.381	2026-05-06 09:20:10.381	\N	1
cmotujn9s001ngzecy7yvs80y	1HD1KHM180BX0010X	2023-street-glide-special-x0010x	cmotujn9q001lgzec0chhmgbl	Grand American Touring	Street Glide Special	2023	Vivid Black	2895000.00	8400	Flagship grand American tourer in single-owner condition. Milwaukee-Eight 114, Boom! Box GTS, premium audio. 110-point inspection complete.	{https://images.medialinksonline.com/8825026x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8822168x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8825056x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.382	\N	2026-05-06 09:20:10.384	2026-05-06 09:20:10.384	\N	1
cmotujn9t001pgzecp4ycr91t	1HD1FBV130BX0010X	2024-fat-boy-114-x0010x	cmotujn9q001lgzec0chhmgbl	Cruiser	Fat Boy 114	2024	Vivid Black	1950000.00	3200	The icon. 2024 Fat Boy 114 with Milwaukee-Eight 114, Lakester wheels, original chrome. Both keys, full service records.	{https://images.medialinksonline.com/8822481x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779234x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7804764x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.384	\N	2026-05-06 09:20:10.386	2026-05-06 09:20:10.386	\N	2
cmotujn9v001rgzecrplh5l6r	1HD1FXX110BX0010X	2022-heritage-classic-114-x0010x	cmotujn9q001lgzec0chhmgbl	Cruiser	Heritage Classic 114	2022	Black Denim	1850000.00	14200	Soft tail Heritage Classic with leather saddlebags, whitewall tyres, classic floorboards. Perfect Sunday cruiser.	{https://images.medialinksonline.com/8225108x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374924x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779193x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.386	\N	2026-05-06 09:20:10.388	2026-05-06 09:20:10.388	\N	3
cmotujn9y001ugzecsih3uj6g	1HD1FBV130BX0011X	2024-fat-boy-114-x0011x	cmotujn9w001sgzecuqfm9zmw	Cruiser	Fat Boy 114	2024	Vivid Black	1950000.00	3200	The icon. 2024 Fat Boy 114 with Milwaukee-Eight 114, Lakester wheels, original chrome. Both keys, full service records.	{https://images.medialinksonline.com/8822481x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779234x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7804764x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.389	\N	2026-05-06 09:20:10.391	2026-05-06 09:20:10.391	\N	1
cmotujna1001wgzecavr79sx2	1HD1FXX110BX0011X	2022-heritage-classic-114-x0011x	cmotujn9w001sgzecuqfm9zmw	Cruiser	Heritage Classic 114	2022	Black Denim	1850000.00	14200	Soft tail Heritage Classic with leather saddlebags, whitewall tyres, classic floorboards. Perfect Sunday cruiser.	{https://images.medialinksonline.com/8225108x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374924x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779193x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.391	\N	2026-05-06 09:20:10.393	2026-05-06 09:20:10.393	\N	2
cmotujna3001ygzecnx5019o8	1HD1RA1A50BX0011X	2024-pan-america-1250-special-x0011x	cmotujn9w001sgzecuqfm9zmw	Adventure Touring	Pan America 1250 Special	2024	Pearl White	2295000.00	5600	Adventure-ready Pan America 1250S with Adaptive Ride Height + 150 hp Revolution Max. Crash bars and top case included.	{https://images.medialinksonline.com/8825071x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8613849x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.394	\N	2026-05-06 09:20:10.396	2026-05-06 09:20:10.396	\N	3
cmotujna60020gzeckbrznzfr	1HD1HX2120BX0011X	2023-sportster-s-x0011x	cmotujn9w001sgzecuqfm9zmw	Sport	Sportster S	2023	Industrial Yellow	1575000.00	7800	Revolution Max 1250T, ride modes, traction control, aggressive bobber stance. Yellow-on-black.	{https://images.medialinksonline.com/8825049x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.396	\N	2026-05-06 09:20:10.398	2026-05-06 09:20:10.398	\N	1
cmotujnas0023gzecm713tzf9	1HD1FXX110BX0012X	2022-heritage-classic-114-x0012x	cmotujna70021gzeci1aypiaw	Cruiser	Heritage Classic 114	2022	Black Denim	1850000.00	14200	Soft tail Heritage Classic with leather saddlebags, whitewall tyres, classic floorboards. Perfect Sunday cruiser.	{https://images.medialinksonline.com/8225108x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374924x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779193x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.418	\N	2026-05-06 09:20:10.42	2026-05-06 09:20:10.42	\N	1
cmotujnau0025gzec18w6ki1r	1HD1RA1A50BX0012X	2024-pan-america-1250-special-x0012x	cmotujna70021gzeci1aypiaw	Adventure Touring	Pan America 1250 Special	2024	Pearl White	2295000.00	5600	Adventure-ready Pan America 1250S with Adaptive Ride Height + 150 hp Revolution Max. Crash bars and top case included.	{https://images.medialinksonline.com/8825071x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8613849x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.421	\N	2026-05-06 09:20:10.423	2026-05-06 09:20:10.423	\N	2
cmotujnax0027gzecejnhznj2	1HD1HX2120BX0012X	2023-sportster-s-x0012x	cmotujna70021gzeci1aypiaw	Sport	Sportster S	2023	Industrial Yellow	1575000.00	7800	Revolution Max 1250T, ride modes, traction control, aggressive bobber stance. Yellow-on-black.	{https://images.medialinksonline.com/8825049x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.423	\N	2026-05-06 09:20:10.425	2026-05-06 09:20:10.425	\N	3
cmotujnb1002agzec0ybntupe	1HD1RA1A50BX0013X	2024-pan-america-1250-special-x0013x	cmotujnay0028gzecp1y8ta9k	Adventure Touring	Pan America 1250 Special	2024	Pearl White	2295000.00	5600	Adventure-ready Pan America 1250S with Adaptive Ride Height + 150 hp Revolution Max. Crash bars and top case included.	{https://images.medialinksonline.com/8825071x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8613849x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.427	\N	2026-05-06 09:20:10.429	2026-05-06 09:20:10.429	\N	1
cmotujnb3002cgzecail6sjqd	1HD1HX2120BX0013X	2023-sportster-s-x0013x	cmotujnay0028gzecp1y8ta9k	Sport	Sportster S	2023	Industrial Yellow	1575000.00	7800	Revolution Max 1250T, ride modes, traction control, aggressive bobber stance. Yellow-on-black.	{https://images.medialinksonline.com/8825049x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.429	\N	2026-05-06 09:20:10.431	2026-05-06 09:20:10.431	\N	2
cmotujnb5002egzecs4qzoq30	1HD1FBM180BX0013X	2024-low-rider-s-x0013x	cmotujnay0028gzecp1y8ta9k	Cruiser	Low Rider S	2024	Vivid Black	1825000.00	2800	Performance cruiser with Milwaukee-Eight 117, mid controls, drag bars, blacked-out finish. Practically new.	{https://images.medialinksonline.com/8757963x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374925x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.431	\N	2026-05-06 09:20:10.433	2026-05-06 09:20:10.433	\N	3
cmotujnb7002ggzecev0w8mvk	1HD1XL2110BX0013X	2021-iron-883-x0013x	cmotujnay0028gzecp1y8ta9k	Sport	Iron 883	2021	Denim Black	895000.00	18400	Everyday Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Second owner, well-maintained.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.434	\N	2026-05-06 09:20:10.435	2026-05-06 09:20:10.435	\N	1
cmotujnba002jgzec8z8ye9m0	1HD1HX2120BX0014X	2023-sportster-s-x0014x	cmotujnb8002hgzeceew1iix7	Sport	Sportster S	2023	Industrial Yellow	1575000.00	7800	Revolution Max 1250T, ride modes, traction control, aggressive bobber stance. Yellow-on-black.	{https://images.medialinksonline.com/8825049x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.437	\N	2026-05-06 09:20:10.439	2026-05-06 09:20:10.439	\N	1
cmotujnbd002lgzectujzffqz	1HD1FBM180BX0014X	2024-low-rider-s-x0014x	cmotujnb8002hgzeceew1iix7	Cruiser	Low Rider S	2024	Vivid Black	1825000.00	2800	Performance cruiser with Milwaukee-Eight 117, mid controls, drag bars, blacked-out finish. Practically new.	{https://images.medialinksonline.com/8757963x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374925x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.44	\N	2026-05-06 09:20:10.442	2026-05-06 09:20:10.442	\N	2
cmotujnbf002ngzecu3ust8hm	1HD1XL2110BX0014X	2021-iron-883-x0014x	cmotujnb8002hgzeceew1iix7	Sport	Iron 883	2021	Denim Black	895000.00	18400	Everyday Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Second owner, well-maintained.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.442	\N	2026-05-06 09:20:10.444	2026-05-06 09:20:10.444	\N	3
cmotujnbj002qgzecbi8c8dw2	1HD1FBM180BX0015X	2024-low-rider-s-x0015x	cmotujnbh002ogzeca63wc49g	Cruiser	Low Rider S	2024	Vivid Black	1825000.00	2800	Performance cruiser with Milwaukee-Eight 117, mid controls, drag bars, blacked-out finish. Practically new.	{https://images.medialinksonline.com/8757963x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8374925x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.446	\N	2026-05-06 09:20:10.448	2026-05-06 09:20:10.448	\N	1
cmotujnbm002sgzecp7hcio9n	1HD1XL2110BX0015X	2021-iron-883-x0015x	cmotujnbh002ogzeca63wc49g	Sport	Iron 883	2021	Denim Black	895000.00	18400	Everyday Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Second owner, well-maintained.	{https://images.medialinksonline.com/8374923x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/7779211x1600x1200xFFFFFFxH.jpg}	AS_IS	\N	\N	ACTIVE	2026-05-06 09:20:10.448	\N	2026-05-06 09:20:10.45	2026-05-06 09:20:10.45	\N	2
cmotujnbo002ugzecqt0mw4r0	1HD1FBR1X0BX0015X	2023-street-bob-114-x0015x	cmotujnbh002ogzeca63wc49g	Cruiser	Street Bob 114	2023	Redline Red	1450000.00	9700	Stripped-down soft-tail bobber with M-8 114. Mini-ape bars, single seat, 19" front. Originally sold by us.	{https://images.medialinksonline.com/8825065x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.45	\N	2026-05-06 09:20:10.452	2026-05-06 09:20:10.452	\N	3
cmotujnbq002wgzecjn8pu3u5	1HD1KEM130BX0015X	2022-road-king-special-x0015x	cmotujnbh002ogzeca63wc49g	Grand American Touring	Road King Special	2022	Vivid Black	2275000.00	16500	Stripped-back tourer with mini-ape handlebars, blacked-out powertrain, hard saddlebags. Authorised dealer service history.	{https://images.medialinksonline.com/8825087x1600x1200xFFFFFFxH.jpg,https://images.medialinksonline.com/8830705x1600x1200xFFFFFFxH.jpg}	CPO	\N	\N	ACTIVE	2026-05-06 09:20:10.453	\N	2026-05-06 09:20:10.455	2026-05-06 09:20:10.455	\N	1
cmoty4ukj00035z98m2bafw9w	1HD1KEM18MBX00001	2021-street-glide-special-x00001	cmol1kd5b0001112jsauiid0d	Grand American Touring	Street Glide Special	2021	Vivid Black	1111111111.00	1111111	avsssssssssssssssssasas	{/api/v1/uploads/listing-images/c1355bff-c92b-4a6c-b733-449a0a4fd0ee.webp,/api/v1/uploads/listing-images/a7626045-3f24-4cec-85eb-e5045424dde3.webp,/api/v1/uploads/listing-images/ae94f47c-3d75-4e99-9db2-86f82433c61c.webp,/api/v1/uploads/listing-images/7e748183-e0c5-40b4-ad44-f15f61b025b9.webp,/api/v1/uploads/listing-images/9ec5e565-2407-4712-b0bb-db99294470a1.webp,/api/v1/uploads/listing-images/945ae0d0-ac6d-4e87-8d23-62e5775aaab7.webp,/api/v1/uploads/listing-images/1b38d8db-ba64-4e62-b960-76b1898d7b07.webp,/api/v1/uploads/listing-images/1f58b1ca-74a8-47aa-b527-c609f20e290a.webp}	CPO	/api/v1/inspection/files/df4b6b07-0fbe-4c9c-be40-27e2ea1c4326.pdf	{"rcUrl": "https://torque.mock/rc/1HD1KEM18MBX00001.pdf", "espUrl": "https://torque.mock/esp/1HD1KEM18MBX00001.pdf", "hogUrl": "https://torque.mock/hog-membership/1HD1KEM18MBX00001.pdf", "rsaUrl": "https://torque.mock/rsa/1HD1KEM18MBX00001.pdf", "cpoCertUrl": "https://torque.mock/cpo-cert/1HD1KEM18MBX00001.pdf", "insuranceUrl": "https://torque.mock/insurance/1HD1KEM18MBX00001.pdf", "deliveryNoteUrl": "https://torque.mock/delivery-note/1HD1KEM18MBX00001.pdf", "serviceHistoryUrl": "https://torque.mock/service-history/1HD1KEM18MBX00001.pdf"}	ACTIVE	2026-05-06 11:01:12.647	\N	2026-05-06 11:00:38.465	2026-05-06 11:01:12.648	\N	1
\.


--
-- Data for Name: Order; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."Order" ("id", "orderId", "buyerName", "buyerPhoneEnc", "buyerEmailEnc", "listingId", "bikeLabel", "dealerId", "status", "estimatedDelivery", "createdAt", "updatedAt") FROM stdin;
cmosniiss000rzzsufb9dvee3	9876543212345678	Rohit Anand	v1:eVf4IW7n1Kb8/D4q.InfF2eVbziZz7LgTxWf6Mg==.vA8TMk4UASDjcP1GbA==	v1:FSab5jGOSMcxJ+Aq.Jbvs9ZvQALveO4u2Il0Mkw==.Q4RAsPSxtgi3qfm+nU56K1Xp	cmol40ewl000er8pel95c4ms7	2023 Harley-Davidson Heritage Classic 114	cmol1kd5b0001112jsauiid0d	IN_TRANSIT	2026-05-15 13:15:34.443	2026-05-05 13:15:34.444	2026-05-05 13:15:34.444
\.


--
-- Data for Name: OrderEvent; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."OrderEvent" ("id", "orderId", "status", "occurredAt", "note") FROM stdin;
cmosniisx000tzzsu6pmthnr6	cmosniiss000rzzsufb9dvee3	ORDER_CONFIRMED	2026-04-28 13:15:34.448	Order confirmed and being prepared.
cmosniisz000vzzsuv5ps9f49	cmosniiss000rzzsufb9dvee3	QUALITY_INSPECTION	2026-04-29 13:15:34.448	110-point inspection completed successfully.
cmosniit1000xzzsupooxkfyr	cmosniiss000rzzsufb9dvee3	DOCUMENTATION	2026-04-30 13:15:34.448	Registration and documentation in progress.
cmosniit2000zzzsu4vk82ond	cmosniiss000rzzsufb9dvee3	IN_TRANSIT	2026-05-04 13:15:34.448	Bike has left dealership, on its way.
\.


--
-- Data for Name: OtpVerification; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."OtpVerification" ("id", "phone", "purpose", "codeHash", "attempts", "verified", "expiresAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: StaticContent; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."StaticContent" ("id", "key", "title", "bodyHtml", "version", "updatedAt") FROM stdin;
cmol1kd6j0004112jnx9gcxt5	about	About H-D Certified	<p>The H-D Certified programme brings the rigour of factory-grade inspection to every pre-owned Harley-Davidson sold through authorised dealers. Every bike passes a 110-point check, comes with a 12-month mechanical &amp; electrical guarantee, kilometre verification, and qualifies for H.O.G. membership.</p><p>Buy with confidence. Sell with ease. Always through an authorised dealer.</p>	1	2026-05-05 13:15:34.418
cmol2atfn0002zpljgcmjoxwi	faq	Frequently Asked Questions	<h2>What is H-D Certified?</h2><p>It is the official Harley-Davidson programme for pre-owned motorcycles. Every bike has been inspected, verified and warranted by an authorised dealer.</p><h2>Can I trade in my existing bike?</h2><p>Yes. Use the Sell Your Bike form and an authorised dealer will reach out within 48 hours.</p><h2>How is my data handled?</h2><p>Your phone and email are encrypted at rest and only revealed to the dealer you enquire with. See our privacy policy for details.</p>	1	2026-05-05 13:15:34.432
cmol40ewv000nr8peyxhgwhuh	privacy	Privacy Policy	<p>We collect only the minimum information required to connect you with an authorised Harley-Davidson dealer: name, phone, email, city/pincode, and the bike(s) you enquire about.</p><h2>How we store data</h2><p>Phone and email are encrypted at rest using AES-256-GCM. Only the dealer to whom your lead is routed can see decrypted contact details.</p><h2>Sharing</h2><p>We do not share your data with third parties for marketing.</p>	1	2026-05-05 13:15:34.433
cmol40ewx000or8pehtaq0vro	terms	Terms &amp; Conditions	<p>The H-D Certified Marketplace acts as an intake platform connecting buyers and sellers with authorised Harley-Davidson dealers. We are not a party to any sale agreement, financing, or insurance contract.</p>	1	2026-05-05 13:15:34.434
cmol40ewy000pr8pe7hlicp8u	contact	Contact Us	<p>For questions about the H-D Certified Marketplace, email <a href="mailto:hello@hd-cpo.local">hello@hd-cpo.local</a>. For questions about a specific bike, contact the dealer listed on the bike's detail page.</p>	1	2026-05-05 13:15:34.435
\.


--
-- Data for Name: TradeInLead; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."TradeInLead" ("id", "dealerId", "username", "bikeModel", "vin", "phoneEnc", "emailEnc", "city", "status", "notes", "createdAt", "updatedAt") FROM stdin;
cmolar07f0001wxxbc8sa45f8	cmol1kd5b0001112jsauiid0d	Gautam	Sport Glide	72727272727272727	v1:fd7GvbmeaYmcHIi3.d2Xfir+cKBeH31zrZJ4IDQ==.0LQEy0yRx7X/9rlOsA==	v1:U9+cV05QpmxxCTn6.OplNz+Tw7UQ4gmEzSEO9ow==.S5Zk10NDagH53IyX0XyvByW73a4nLYFw0u3X	Hero Parts	CLOSED	\N	2026-04-30 09:43:52.006	2026-04-30 09:46:33.34
cmoss9ob50003i27cs9mdz36u	cmol1kd5b0001112jsauiid0d	Test Seller	Street Glide Special	1HD1KHM18MB123456	v1:CoFdbkPOOvlpUikT.P8wJobkdo+dpcq//iKuXMA==.zwOYLLmtFFzwgplFBA==	v1:Z+R1VCLFsKaCp09U.hq/JjnTSxfxkUmCZ4CP7XQ==.wIzRWoOnnsmpKUGyxQ==	Mumbai	NEW	\N	2026-05-05 15:28:39.762	2026-05-05 15:28:39.762
cmosts26p0001v3rwd7jrjjg6	cmol40eun0002r8pe0sbd12e0	Dealer Pick Tester	Iron 883	1HD1XL211NB987654	v1:X2dDEcXTZegVUEjJ.+ZrmJtHJJ2E4k2tzUqHeAg==.fA3KzDZp0q9h/zx6LA==	v1:96xDlvPeVozRV3nB.BewtbwP7uu5LypmHf+h8dg==.IeBkORzG8jMIhwhvUP3jBq+u	Bangalore	NEW	\N	2026-05-05 16:10:57.169	2026-05-05 16:10:57.169
cmosts3vw0003v3rw6skdqwp5	cmol1kd5b0001112jsauiid0d	Bogus ID Tester	Iron 883	1HD1XL211NB876543	v1:oHktQ9/3BBsJcazr.yC2MexJrerpwDqN5oG4gRA==.ZWylKnOxOx1TJBf73g==	v1:316xjx5TYjLUM7Qq.FcWRgdXlAuou0RfNFN1mTw==.GalcVtkAgybWfdxI	Pune	NEW	\N	2026-05-05 16:10:59.372	2026-05-05 16:10:59.372
cmothlgq100047bgbjilebac8	cmol1kd5b0001112jsauiid0d	Seller Smoke	Iron 883	1HD4LL413LB000099	v1:xwYhAnwqX6tErysV.WNwmL/cq6j7vQXhi+bjW9A==.23dCsYqszklL/AXm9g==	v1:C7IyfeLl//cWBZMp.w5daS4iNy/IWdR29h0Txdg==.uaejRtUP97V/4H0o9xw0LC4=	Gurgaon	NEW	\N	2026-05-06 03:17:40.201	2026-05-06 03:17:40.201
cmotrubdd00037fb8z7nrt0ug	cmol1kd5b0001112jsauiid0d	Mohit	Street Glide	12222222222222222	v1:yOsRjUxtQMPJ0EuJ.CnpvSi2LTgaBdAce5FjK5Q==.YA2UQu6HSj+nqVjRSw==	v1:KfWL40f+PJQcsgNz.lqCa3Gs0rCOUA5IcmEe75w==.LEKYteqt3NOhZOSu9dMu3Sajzh+G2NGOn6Eq	Gurgaon	NEW	\N	2026-05-06 08:04:29.316	2026-05-06 08:04:29.316
cmotyzfzl0005mp2duh025idx	cmol1kd5b0001112jsauiid0d	Test Seller	2019 Iron 883	1HD1KEM18MB000001	v1:LpHgxH0Fh32WJMTK.fZKBIq0ABmQOjof9d/wsrg==.qZVd9HiVgI9rB9X7Kg==	v1:3nR+wSVV01Zy2orl.V/eUKetsuIUFsLzqTcIFuw==.muw3LxvzPDDAn8/B6ok=	Gurgaon	NEW	\N	2026-05-06 11:24:25.905	2026-05-06 11:24:25.905
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count") FROM stdin;
35e4227d-91fc-4044-8101-32e160e48d51	051144cb0b70077550321b0e932b52c87e06f52da48b14b1012f974d74092556	2026-05-06 09:01:28.615739+05:30	20260506000000_initial_baseline		\N	2026-05-06 09:01:28.615739+05:30	0
34fe1cd2-6806-4c6a-9324-7bcf9b7b1f3e	687ee962b18a22de2b8f9d1e9756398091fdb215822adde6b6d2ff4c31151578	2026-05-06 10:38:48.645924+05:30	20260506100000_listing_add_owners	\N	\N	2026-05-06 10:38:48.603339+05:30	1
\.


--
-- Name: AdminUser AdminUser_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AdminUser"
    ADD CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id");


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id");


--
-- Name: Dealer Dealer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Dealer"
    ADD CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id");


--
-- Name: Enquiry Enquiry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Enquiry"
    ADD CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id");


--
-- Name: GeneralLead GeneralLead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."GeneralLead"
    ADD CONSTRAINT "GeneralLead_pkey" PRIMARY KEY ("id");


--
-- Name: LeadComment LeadComment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."LeadComment"
    ADD CONSTRAINT "LeadComment_pkey" PRIMARY KEY ("id");


--
-- Name: Listing Listing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Listing"
    ADD CONSTRAINT "Listing_pkey" PRIMARY KEY ("id");


--
-- Name: OrderEvent OrderEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."OrderEvent"
    ADD CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id");


--
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY ("id");


--
-- Name: OtpVerification OtpVerification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."OtpVerification"
    ADD CONSTRAINT "OtpVerification_pkey" PRIMARY KEY ("id");


--
-- Name: StaticContent StaticContent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."StaticContent"
    ADD CONSTRAINT "StaticContent_pkey" PRIMARY KEY ("id");


--
-- Name: TradeInLead TradeInLead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."TradeInLead"
    ADD CONSTRAINT "TradeInLead_pkey" PRIMARY KEY ("id");


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."_prisma_migrations"
    ADD CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id");


--
-- Name: AdminUser_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AdminUser_email_key" ON "public"."AdminUser" USING "btree" ("email");


--
-- Name: AuditLog_actorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_actorId_idx" ON "public"."AuditLog" USING "btree" ("actorId");


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog" USING "btree" ("createdAt");


--
-- Name: AuditLog_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_entityType_entityId_idx" ON "public"."AuditLog" USING "btree" ("entityType", "entityId");


--
-- Name: Dealer_torqueDealerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Dealer_torqueDealerId_key" ON "public"."Dealer" USING "btree" ("torqueDealerId");


--
-- Name: Dealer_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Dealer_username_key" ON "public"."Dealer" USING "btree" ("username");


--
-- Name: Enquiry_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Enquiry_createdAt_idx" ON "public"."Enquiry" USING "btree" ("createdAt");


--
-- Name: Enquiry_dealerId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Enquiry_dealerId_status_idx" ON "public"."Enquiry" USING "btree" ("dealerId", "status");


--
-- Name: GeneralLead_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GeneralLead_createdAt_idx" ON "public"."GeneralLead" USING "btree" ("createdAt");


--
-- Name: GeneralLead_dealerId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GeneralLead_dealerId_status_idx" ON "public"."GeneralLead" USING "btree" ("dealerId", "status");


--
-- Name: LeadComment_leadKind_leadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadComment_leadKind_leadId_idx" ON "public"."LeadComment" USING "btree" ("leadKind", "leadId");


--
-- Name: Listing_modelFamily_modelName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Listing_modelFamily_modelName_idx" ON "public"."Listing" USING "btree" ("modelFamily", "modelName");


--
-- Name: Listing_price_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Listing_price_idx" ON "public"."Listing" USING "btree" ("price");


--
-- Name: Listing_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Listing_slug_key" ON "public"."Listing" USING "btree" ("slug");


--
-- Name: Listing_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Listing_status_idx" ON "public"."Listing" USING "btree" ("status");


--
-- Name: Listing_vin_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Listing_vin_key" ON "public"."Listing" USING "btree" ("vin");


--
-- Name: Listing_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Listing_year_idx" ON "public"."Listing" USING "btree" ("year");


--
-- Name: OrderEvent_orderId_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderEvent_orderId_occurredAt_idx" ON "public"."OrderEvent" USING "btree" ("orderId", "occurredAt");


--
-- Name: Order_dealerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Order_dealerId_idx" ON "public"."Order" USING "btree" ("dealerId");


--
-- Name: Order_orderId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Order_orderId_key" ON "public"."Order" USING "btree" ("orderId");


--
-- Name: Order_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Order_status_idx" ON "public"."Order" USING "btree" ("status");


--
-- Name: OtpVerification_phone_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OtpVerification_phone_createdAt_idx" ON "public"."OtpVerification" USING "btree" ("phone", "createdAt");


--
-- Name: StaticContent_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaticContent_key_key" ON "public"."StaticContent" USING "btree" ("key");


--
-- Name: TradeInLead_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TradeInLead_createdAt_idx" ON "public"."TradeInLead" USING "btree" ("createdAt");


--
-- Name: TradeInLead_dealerId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TradeInLead_dealerId_status_idx" ON "public"."TradeInLead" USING "btree" ("dealerId", "status");


--
-- Name: AuditLog AuditLog_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AuditLog"
    ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."AdminUser"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Enquiry Enquiry_dealerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Enquiry"
    ADD CONSTRAINT "Enquiry_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "public"."Dealer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Enquiry Enquiry_listingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Enquiry"
    ADD CONSTRAINT "Enquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: GeneralLead GeneralLead_dealerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."GeneralLead"
    ADD CONSTRAINT "GeneralLead_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "public"."Dealer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Listing Listing_dealerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Listing"
    ADD CONSTRAINT "Listing_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "public"."Dealer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OrderEvent OrderEvent_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."OrderEvent"
    ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Order Order_dealerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Order"
    ADD CONSTRAINT "Order_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "public"."Dealer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Order Order_listingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Order"
    ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: TradeInLead TradeInLead_dealerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."TradeInLead"
    ADD CONSTRAINT "TradeInLead_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "public"."Dealer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict sBVYZWOcV3qvDc8WQ1KqRydIl5F2VZyxT7UtirmQN9O0RLFTtigAjAnhQOCSnIS

